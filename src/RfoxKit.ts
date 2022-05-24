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
import RFOXTVABI from "./abis/RFOXTV.json";

import { handleError } from "./errors/utils";
import { ErrorApiResponse, ProofApiResponse, RfoxTvProofResponse } from "./typings/api-responses";
import Web3Modal, { IProviderOptions } from "web3modal";
import { PROVIDER_OPTIONS } from "./config/providers";
import {
  JsonRpcProvider,
  JsonRpcSigner,
  Provider,
  TransactionResponse,
  Web3Provider,
} from "@ethersproject/providers";
import { NETWORKS } from "./config/network";
import { API_ENDPOINT, API_ENDPOINT_DEV } from "./config/endpoint";

const abis: Record<string, unknown> = {
  standard: RFOXErc721StandardABI,
  whitelist: RFOXErc721WhitelistABI,
  botprevention: RFOXErc721BotPreventionABI,
  rfoxtv: RFOXTVABI,
};

export default class RfoxKit {
  dev: boolean;
  address: string;
  collectionId?: string;
  contract: Contract = {} as Contract;
  walletAddress?: string;
  walletBalance?: string;
  assetId?: string;
  contractType: string;
  maxSupply: number;
  currentSupply: number;
  maxPerTx: number;
  maxPerTxWL: number;
  salePrice: BigNumber;
  preSalePrice: BigNumber;
  isPublicActive: boolean;
  isSaleActive: boolean;
  provider: Web3Provider | JsonRpcProvider = {} as Web3Provider;
  signer: JsonRpcSigner = {} as JsonRpcSigner;
  ethInstance: any;
  chainId = 1;
  networkName = "";

  private get apiBaseUrl(): string {
    return this.dev ? API_ENDPOINT_DEV : API_ENDPOINT;
  }


  constructor() {
    this.dev = false;
    this.address = "";
    this.contractType = "standard";
    this.maxSupply = 0;
    this.currentSupply = 0;
    this.isPublicActive = false;
    this.isSaleActive = false;
    this.maxPerTx = 0;
    this.maxPerTxWL = 0;
    this.salePrice = BigNumber.from(0);
    this.preSalePrice = BigNumber.from(0);
  }

  async init(
    dev: boolean,
    contractAddress: string,
    collectionId: string,
    contractType: string,
    networkName: string,
    chainId: number,
    providerOptions: IProviderOptions,
    assetId?: string,
    provider?: JsonRpcProvider,
  ) {
    if (!contractAddress || !collectionId) {
      throw new Error("Collection is not ready yet.");
    }

    console.log('init param', {
      dev,
      contractAddress,
      collectionId,
      contractType,
      networkName,
      chainId,
      assetId
    })

    this.dev = dev;
    this.address = contractAddress;
    this.collectionId = collectionId;
    this.contractType = contractType;
    this.networkName = networkName;
    this.chainId = chainId;
    this.assetId = assetId;

    console.log('assign value', this.assetId)

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
      this.walletBalance = ethers.utils.formatEther(await this.signer.getBalance())
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
    dev: boolean,
    contractAddress: string,
    collectionId: string,
    contractType: string,
    networkName: string,
    chainId: number,
    providerOptions?: IProviderOptions,
    assetId?:string,
    provider?: JsonRpcProvider,
  ): Promise<RfoxKit | null> {
    try {
      const rfoxKit = new RfoxKit();

      await rfoxKit.init(
        dev,
        contractAddress,
        collectionId,
        contractType,
        networkName,
        chainId,
        providerOptions || PROVIDER_OPTIONS,
        assetId,
        provider,
      );

        //get collection details when its standard contract
      console.log('get collection details', contractType)
      await rfoxKit.getCollectionDetails(contractType)

      return rfoxKit;
    } catch (error) {
      handleError(error as EthereumRpcError<unknown>);
      return null;
    }
  }

  async price(): Promise<BigNumber> {
    const contractPrice: BigNumber = await this.contract.TOKEN_PRICE();

    return contractPrice;
  }

  async priceRfoxTv(): Promise<BigNumber> {
    const contractPrice: BigNumber = await this.contract.tokenPrice();

    return contractPrice;
  }

  async pricePreSale(): Promise<BigNumber> {
    const contractPresalePrice: BigNumber =
      await this.contract.TOKEN_PRICE_PRESALE();

    return contractPresalePrice;
  }

  async maxAmount(): Promise<number> {
    const contractMaxAmount = await this.contract.MAX_NFT();

    return Number(contractMaxAmount);
  }

  async maxPerMint(): Promise<number> {
    const maxTokensPerTransaction =
      await this.contract.maxTokensPerTransaction();

    return Number(maxTokensPerTransaction);
  }

  async maxPerMintPresale(): Promise<number> {
    const maxTokensPerTransactionPresale =
      await this.contract.maxMintedPresalePerAddress();

    return Number(maxTokensPerTransactionPresale);
  }

  async totalSupply(): Promise<number> {
    const totalSupply = await this.contract.totalSupply();
    return Number(totalSupply);
  }

  async saleActive(): Promise<boolean> {
    return Number(await this.contract.saleStartTime()) < Number(new Date());
  }

  async publicActive(): Promise<boolean> {
    if (this.contractType === "standard") {
      return true;
    }
    return (
      Number(await this.contract.publicSaleStartTime()) < Number(new Date())
    );
  }

  async getCollectionDetails(contractType: string) {
    // this.maxMinted = await this.maxAmount();
    // this.isPublicActive = await this.publicActive();
    // this.isPresaleActive = await this.saleActive() && !this.isPublicActive;
    // this.currentMinted = await this.totalSupply();

    if(contractType === 'rfoxtv') {
      this.maxSupply = 0; //no limit
      this.currentSupply = 0; //no supply cap for rfox tv
      this.isSaleActive = true;
      this.maxPerTx = 1; // for now remain as 1

      this.salePrice = await this.priceRfoxTv();
    }
    else {
      this.maxSupply = await this.maxAmount();
      this.currentSupply = await this.totalSupply();
      this.isSaleActive = await this.saleActive();
      this.maxPerTx = await this.maxPerMint();

      this.salePrice = BigNumber.from(0);

      if(contractType !== 'standard') {
        this.maxPerTxWL = await this.maxPerMintPresale();
        this.isPublicActive = await this.publicActive();
        this.preSalePrice = await this.pricePreSale();
      }

    }

    return;

  }

  async videoMinted(videoId: string): Promise<boolean> {

    const videoByte = ethers.utils.formatBytes32String(videoId)

    const usedExternalID: boolean = await this.contract.usedExternalID(videoByte);

    return usedExternalID;
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

  async generateProofRfoxTv(): Promise<RfoxTvProofResponse & ErrorApiResponse> {
    console.log('generate proof tv', this.walletAddress, this.assetId)
    const { data } = await axios.get<RfoxTvProofResponse & ErrorApiResponse>(
      `${this.apiBaseUrl}/api/rfoxtv/signedMessage/${this.walletAddress}/${this.assetId}`,
    );

    return data;
  }

  async mint(quantity: number): Promise<ContractReceipt | null> {
    try {
      // safety check
      console.log('quantity check')
      quantity = this.contractType === 'rfoxtv' ? 1 : Number(Math.min(quantity, await this.maxPerMint()));

      console.log('sale check')
      const saleActive = this.contractType === 'rfoxtv' ? true : await this.saleActive();
      const publicActive = this.contractType === 'rfoxtv' ? true : await this.publicActive();

      console.log('max per wallet check')
      const maxPerWallet = this.contractType === 'rfoxtv' ? 1 :
        saleActive && !publicActive
          ? await this.maxPerMintPresale()
          : await this.maxPerMint();

      if (quantity > maxPerWallet) {
        throw new Error(
          `You can't mint more than ${maxPerWallet} tokens in this transactions`
        );
      }

      if (!saleActive && !publicActive) {
        throw new Error("Collection is not on sale");
      }

      const price = this.contractType === 'rfoxtv' ? await this.priceRfoxTv() :
        saleActive && !publicActive
          ? await this.pricePreSale()
          : await this.price();

      const amount = price.mul(quantity);

      if(this.contractType === 'rfoxtv') {
        console.log('mint thru rfox tv contract')
        return await this._mintRfoxTv(quantity, amount)
      }

      // Presale minting
      if (saleActive && !publicActive) {
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
    const trx: ContractTransaction = await this.contract.buyNFTsPublic(
      quantity,
      {
        value: amount,
      }
    );

    return trx.wait();
  }

  private async _mintRfoxTv(
    quantity: number,
    amount: BigNumber
  ): Promise<ContractReceipt> {

    const data = await this.generateProofRfoxTv();
    if (data.message) {
      if (this.contractType === "standard") {
        throw new Error("This is not supported contract type");
      }
      throw new Error("There is a problem while signing your video for minting");
    }

    console.log('proof', data);

    console.log('contract param', {wallet: this.walletAddress,
      quantity,
      externalId: data.externalId,
      salt: data.salt,
      signature: data.signature,
      value: amount})

    const trx: ContractTransaction = await this.contract.safeMint(
      this.walletAddress,
      quantity,
      [data.externalId],
      data.salt,
      data.signature,
      {
        value: amount,
      }
    );
    // .then((response: TransactionResponse) => {
    //   console.log('response tx', response)
    //   return response.hash
    // });

    // console.log('trx', trx)


    // if(trx) {
    //   return trx
    // }

    // else {
    //   throw new Error("There is a problem while minting your asset");
    // }

    return trx.wait()

  }

  private async _presaleMint(
    quantity: number,
    amount: BigNumber
  ): Promise<ContractReceipt> {
    const data = await this.generateProof();
    if (data.message) {
      // Backwards compatibility for v2 contracts
      if (this.contractType === "standard") {
        throw new Error("Collection does not support preSale");
      }
      throw new Error("Your wallet is not part of presale.");
    }

    //TODO: Explore dynamic function name here later
    //Example: this.contract.this[functionName]()

    const trx: ContractTransaction = await this.contract.buyNFTsPresale(
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
