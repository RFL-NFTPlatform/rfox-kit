import axios from "axios";
import { EthereumRpcError } from "eth-rpc-errors";
import {
  ethers,
  Contract,
  BigNumber,
  ContractTransaction,
  ContractReceipt,
  Signer,
  ContractInterface,
} from "ethers";
import RFOXErc721StandardABI from "./abis/RFOXERC721Standard.json";
import RFOXErc721WhitelistABI from "./abis/RFOXERC721Whitelist.json";
import RFOXErc721BotPreventionABI from "./abis/RFOXERC721BotPrevention.json";
import { handleError } from "./errors/utils";
import { ErrorApiResponse, ProofApiResponse } from "./typings/api-responses";
import Web3Modal, { IProviderOptions } from "web3modal";
import { PROVIDER_OPTIONS } from "./config/providers";
import {
  JsonRpcProvider,
  JsonRpcSigner,
  Provider,
  Web3Provider,
} from "@ethersproject/providers";
import { NETWORKS } from "./config/network";
import { API_ENDPOINT, API_ENDPOINT_DEV } from "./config/endpoint";

const abis: Record<string, unknown> = {
  standard: RFOXErc721StandardABI,
  whitelist: RFOXErc721WhitelistABI,
  botprevention: RFOXErc721BotPreventionABI,
};

export default class RfoxKit {
  dev?: boolean;
  address: string;
  collectionId?: string;
  contract: Contract = {} as Contract;
  walletAddress?: string;
  contractType: string;
  maxSupply?: number;
  provider: Web3Provider | JsonRpcProvider = {} as Web3Provider;
  signer: JsonRpcSigner = {} as JsonRpcSigner;
  ethInstance: any;
  chainId = 1;
  networkName = "";

  private get apiBaseUrl(): string {
    return this.dev ? API_ENDPOINT_DEV : API_ENDPOINT;
  }

  constructor() {
    this.address = "";
    this.contractType = "standard";
    this.maxSupply = 0;
  }

  async init(
    contractAddress: string,
    collectionId: string,
    contractType: string,
    networkName: string,
    chainId: number,
    maxSupply: number,
    providerOptions: IProviderOptions,
    provider?: JsonRpcProvider
  ) {
    if (!contractAddress || !collectionId) {
      throw new Error("Collection is not ready yet.");
    }

    this.address = contractAddress;
    this.collectionId = collectionId;
    this.contractType = contractType;
    this.networkName = networkName;
    this.chainId = chainId;
    this.maxSupply = maxSupply;

    const abi = abis[this.contractType || "standard"];

    let signerOrProvider: Signer | Provider;
    if (provider) {
      this.provider = provider;
      signerOrProvider = provider;
    } else {
      const web3Modal = new Web3Modal({
        network: this.networkName,
        providerOptions,
      });
      this.ethInstance = await web3Modal.connect();
      if (!this.ethInstance) {
        throw new Error("No provider found");
      }

      await this._initProvider();
      await this._checkNetwork();

      if (this.ethInstance.on) {
        this.ethInstance.on("disconnect", () => {
          window.location.reload();
        });
        this.ethInstance.on("accountsChanged", () => {
          window.location.reload();
        });
      }

      this.walletAddress = await this.signer.getAddress();
      signerOrProvider = this.signer;
    }
    if (!this.address) {
      throw new Error("Smart contract is not deployed yet.");
    }
    this.contract = new ethers.Contract(
      contractAddress,
      abi as ContractInterface,
      signerOrProvider
    );
    if (!this.contract) {
      throw new Error("Initialization failed.");
    }

    return;
  }

  static async create(
    contractAddress: string,
    collectionId: string,
    contractType: string,
    networkName: string,
    chainId: number,
    maxSupply: number,
    providerOptions?: IProviderOptions,
    provider?: JsonRpcProvider
  ): Promise<RfoxKit | null> {
    try {
      const rfoxKit = new RfoxKit();

      await rfoxKit.init(
        contractAddress,
        collectionId,
        contractType,
        networkName,
        chainId,
        maxSupply,
        providerOptions || PROVIDER_OPTIONS,
        provider
      );
      return rfoxKit;
    } catch (error) {
      handleError(error as EthereumRpcError<unknown>);
      return null;
    }
  }

  async price(): Promise<BigNumber> {
    const contractMaxPrice: BigNumber = await this.contract.TOKEN_PRICE();

    return contractMaxPrice;
  }

  async maxAmount(): Promise<number> {
    const contractMaxAmount = await this.contract.MAX_NFT();

    return contractMaxAmount.toNumber();
  }

  async maxPerMint(): Promise<number> {
    const maxTokensPerTransaction: BigNumber =
      await this.contract.maxTokensPerTransaction();

    return maxTokensPerTransaction.toNumber();
  }

  async totalSupply(): Promise<number> {
    const mintedNfts: BigNumber = await this.contract.totalSupply();
    return mintedNfts.toNumber();
  }

  async saleActive(): Promise<boolean> {
    return (
      (await this.contract.saleStartTime().toNumber()) < Number(new Date())
    );
  }

  async publicActive(): Promise<boolean> {
    if (this.contractType === "standard") {
      return true;
    }
    return (
      (await this.contract.publicSaleStartTime().toNumber()) <
      Number(new Date())
    );
  }

  async generateProof(): Promise<ProofApiResponse & ErrorApiResponse> {
    const { data } = await axios.post<ProofApiResponse & ErrorApiResponse>(
      `${this.apiBaseUrl}/drops/list/${this.collectionId}`,
      {
        wallet: this.walletAddress,
      },
      {
        validateStatus: (status) => status < 500,
      }
    );

    return data;
  }

  async mint(quantity: number): Promise<ContractReceipt | null> {
    try {
      // safety check
      quantity = Number(Math.min(quantity, await this.maxPerMint()));

      const saleActive = await this.saleActive();
      const publicActive = await this.publicActive();

      const maxPerWallet = await this.maxPerWallet();

      if (quantity > maxPerWallet) {
        throw new Error(
          `You can't mint more than ${maxPerWallet} tokens on your wallet`
        );
      }

      if (!saleActive && !presaleActive) {
        throw new Error("Collection is not on sale");
      }

      const price = auctionActive
        ? await this.auctionPrice()
        : await this.price();
      const amount = price.mul(quantity);

      // Presale minting
      if (presaleActive) {
        // Backwards compatibility with v2 contracts:
        // If the public sale is not active, we can still try mint with the presale
        return await this._presaleMint(quantity, amount);
      }

      // Regular minting
      return await this._mint(quantity, amount);
    } catch (error) {
      handleError(error as EthereumRpcError<unknown>);
      return null;
    }
  }

  private async _mint(
    quantity: number,
    amount: BigNumber
  ): Promise<ContractReceipt> {
    const trx: ContractTransaction = await this.contract.mint(quantity, {
      value: amount,
    });

    return trx.wait();
  }

  private async _presaleMint(
    quantity: number,
    amount: BigNumber,
    functionName: string
  ): Promise<ContractReceipt> {
    const data = await this.generateProof();
    if (data.message) {
      // Backwards compatibility for v2 contracts
      if (this.version === 3) {
        throw new Error(
          "Collection is not active or your wallet is not part of presale."
        );
      }
      throw new Error("Your wallet is not part of presale.");
    }

    const trx: ContractTransaction = await this.contract.this[functionName](
      quantity,
      data.proof,
      {
        value: amount,
      }
    );

    return trx.wait();
  }

  private async _initProvider(): Promise<void> {
    this.provider = new ethers.providers.Web3Provider(this.ethInstance);
    this.signer = this.provider.getSigner();
  }

  private async _checkNetwork(): Promise<void> {
    const network = await this.provider.getNetwork();
    if (this.chainId !== network.chainId) {
      // see https://docs.metamask.io/guide/rpc-api.html#usage-with-wallet-switchethereumchain
      try {
        await this.ethInstance.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${this.chainId.toString(16)}` }],
        });
      } catch (error: unknown) {
        const switchError = error as EthereumRpcError<unknown>;
        if (switchError.code === 4902 || switchError.code === -32603) {
          const network = NETWORKS[this.chainId];
          if (!network) {
            throw new Error("Unknown network");
          }
          try {
            await this.ethInstance.request({
              method: "wallet_addEthereumChain",
              params: [network],
            });
          } catch (addError: unknown) {
            throw addError;
          }
        } else {
          throw error;
        }
      }

      await this._initProvider();
    }
  }
}
