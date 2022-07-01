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
import RFOXErc1155StandardABI from "./abis/RFOXERC1155Standard.json";
import RFOXErc1155WhitelistABI from "./abis/RFOXERC1155Whitelist.json";


import { handleError } from "./errors/utils";
import { ErrorApiResponse, ProofApiResponse, RfoxTvProofResponse } from "./typings/api-responses";
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
import { MerkleTree } from "merkletreejs";
import { DataToken, DataTokenPresale } from "./typings/ERC1155-responses";
import { keccak256 } from "@ethersproject/keccak256";

const abis: Record<string, unknown> = {
  standard_721: RFOXErc721StandardABI,
  whitelist_721: RFOXErc721WhitelistABI,
  botprevention_721: RFOXErc721BotPreventionABI,
  rfoxtv: RFOXTVABI,
  standard_1155: RFOXErc1155StandardABI,
  whitelist_1155: RFOXErc1155WhitelistABI
};

export default class RfoxKit {
  dev: boolean;
  address: string;
  collectionId?: string;
  contract: Contract = {} as Contract;
  walletAddress?: string;
  walletBalance?: string;
  assetId?: string;
  whitelistUrl: string;
  contractType: string;
  maxSupply: number;
  currentSupply: number;
  maxPerTx: number;
  maxPerTxWL: number;
  salePrice: BigNumber;
  preSalePrice: BigNumber;
  isPublicActive: boolean;
  isSaleActive: boolean;
  saleStartTime:number;
  saleEndTime:number;
  publicSaleStartTime: number;
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
    this.contractType = "standard_721";
    this.maxSupply = 0;
    this.currentSupply = 0;
    this.isPublicActive = false;
    this.isSaleActive = false;
    this.maxPerTx = 0;
    this.maxPerTxWL = 0;
    this.salePrice = BigNumber.from(0);
    this.preSalePrice = BigNumber.from(0);
    this.whitelistUrl = "";
    this.saleStartTime = 0;
    this.saleEndTime = 0;
    this.publicSaleStartTime = 0;
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
    whitelistUrl?: string,
    provider?: JsonRpcProvider,
  ) {
    if (!contractAddress || !collectionId) {
      throw new Error("Collection is not ready yet.");
    }

    this.dev = dev;
    this.address = contractAddress;
    this.collectionId = collectionId;
    this.contractType = contractType;
    this.networkName = networkName;
    this.chainId = chainId;
    this.assetId = assetId;
    this.whitelistUrl = whitelistUrl || "";

    const abi = abis[this.contractType || "standard_721"];

    let signerOrProvider: Signer | Provider;

    if (provider) {
      this.provider = provider;
      signerOrProvider = provider;
    } else {
      const web3Modal = new Web3Modal({
        network: this.networkName,
        providerOptions,
        theme: "dark"
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
    whitelistUrl?: string,
    provider?: JsonRpcProvider,
  ): Promise<RfoxKit | null> {
    try {
      const rfoxKit = new RfoxKit();

      console.log('assigned url', whitelistUrl)

      await rfoxKit.init(
        dev,
        contractAddress,
        collectionId,
        contractType,
        networkName,
        chainId,
        providerOptions || PROVIDER_OPTIONS,
        assetId,
        whitelistUrl,
        provider,
      );

      //get collection details when its standard contract
      console.log('get collection details', contractType)

      //check if 1155

      if(contractType === 'standard_1155' || contractType === 'whitelist_1155') {

        if(!assetId) {
          throw new Error("Contract and Asset Id is required");
        }

        await rfoxKit.getCollectionDetails1155(contractType, Number(assetId));
      }
      else {
        await rfoxKit.getCollectionDetails(contractType);
      }

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
    const currentTime = Math.round(Date.now() / 1000);

    const saleStartTime = Number(await this.contract.saleStartTime())

    console.log('saleStartTime', saleStartTime, currentTime)

    return saleStartTime < currentTime;
  }

  async getSaleStartTime(): Promise<number> {
    return Number(await this.contract.saleStartTime());
  }

  async getSaleEndTime(): Promise<number> {
    return Number(await this.contract.saleEndTime());
  }

  async getPublicSaleStartTime(): Promise<number> {
    return Number(await this.contract.publicSaleStartTime());
  }

  async publicActive(): Promise<boolean> {
    const currentTime = Math.round(Date.now() / 1000);

    console.log('checking public active' , this.contractType)
    if (this.contractType === "standard_721") {
      return true;
    }

    const publicSaleTime =  Number(await this.contract.publicSaleStartTime())

    console.log('publicSaleTime', publicSaleTime, currentTime)

    return publicSaleTime < currentTime;
  }


  async getCollectionDetails(contractType: string) {

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

      this.salePrice = await this.price();

      this.saleStartTime = await this.getSaleStartTime();
      this.saleEndTime = await this.getSaleEndTime();

      if(contractType !== 'standard_721') {
        this.maxPerTxWL = await this.maxPerMintPresale();
        this.isPublicActive = await this.publicActive();
        this.preSalePrice = await this.pricePreSale();
        this.publicSaleStartTime = await this.getPublicSaleStartTime();

      }

    }

    return;

  }

  async erc1155TokenInfo(tokenId: number): Promise<DataToken>{

    const tokenInfo: DataToken =
      await this.contract.dataTokens(tokenId);

    return tokenInfo;

  }

  async erc1155TokenPresaleInfo(tokenId: number): Promise<DataTokenPresale>{

    const tokenInfo: DataTokenPresale =
      await this.contract.dataPresaleSettings(tokenId);

    return tokenInfo;

  }

  async totalSupply1155(tokenId: number): Promise<number> {
    const totalSupply = await this.contract.totalSupply(tokenId);
    return Number(totalSupply);
  }

  async getCollectionDetails1155(contractType: string, assetId: number){

    console.log('get collection details 1155', contractType, assetId)
    const tokenInfo = await this.erc1155TokenInfo(assetId);

    if(tokenInfo) {

      const currentTime = Math.round(Date.now() / 1000);

      this.maxSupply = tokenInfo.maxSupply
      this.currentSupply = await this.totalSupply1155(assetId)
      this.isSaleActive = Number(tokenInfo.saleStartTime) < currentTime && tokenInfo.active && currentTime < Number(tokenInfo.saleEndTime);
      console.log('date data', Number(tokenInfo.saleStartTime), currentTime, tokenInfo.active, Number(tokenInfo.saleEndTime))
      this.maxPerTx = tokenInfo.maxTokensPerTransaction;

      this.salePrice = tokenInfo.tokenPrice;

      this.saleStartTime = tokenInfo.saleStartTime;
      this.saleEndTime = tokenInfo.saleEndTime;

      if(contractType === 'whitelist_1155') {

        const whitelistInfo = await this.erc1155TokenPresaleInfo(assetId);

        console.log('public check', Number(whitelistInfo.publicSaleStartTime),  currentTime, (Number(whitelistInfo.publicSaleStartTime) > currentTime));

        this.maxPerTxWL = whitelistInfo.maxMintedPresalePerAddress;
        this.isPublicActive = Number(whitelistInfo.publicSaleStartTime) < currentTime;
        this.preSalePrice = whitelistInfo.tokenPricePresale;

        this.publicSaleStartTime = whitelistInfo.publicSaleStartTime;

      }

    }

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

  async generateProofLocally(whitelistUrl: string): Promise<string[]> {

    console.log('url', whitelistUrl)
    const { data } = await axios.get<string[]>(whitelistUrl);
    console.log('data from reading url', data)

    if(data) {
      const leafNodes = data.map(address => keccak256(address));
      const merkleTree = new MerkleTree(leafNodes, keccak256, {sortPairs: true});

      console.log('wallet address', this?.walletAddress)
      const proof = merkleTree.getHexProof(keccak256(this?.walletAddress || ''))

      return proof;
    }

    return []

  }

  async mint(quantity: number): Promise<ContractReceipt | null> {

    if(this.contractType === 'standard_1155' || this.contractType === 'whitelist_1155') {
     return await this.mint1155(quantity);
    }
    else {
      try {
        // safety check

        console.log('quantity check')
        quantity = this.contractType === 'rfoxtv' ? 1 : Number(Math.min(quantity, await this.maxPerMint()));

        console.log('sale check')
        const saleActive = this.contractType === 'rfoxtv' ? true : await this.saleActive();
        const publicActive = this.contractType === 'rfoxtv' ? true : await this.publicActive();

        console.log('sale active', saleActive);
        console.log('public active', publicActive);

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

          return await this._presaleMint(quantity, amount, this.whitelistUrl);
        }

        // Regular minting
        return await this._mint(quantity, amount);
      } catch (error) {
        handleError(error as EthereumRpcError<unknown>);
        return null;
      }
    }


  }

  async mint1155(quantity: number): Promise<ContractReceipt | null> {


    try {

      console.log('sale check', this.isSaleActive, this.isPublicActive)
      const isPresalePeriod = this.isSaleActive && !this.isPublicActive
      console.log('isPresalePeriod', isPresalePeriod)

      // safety check
      console.log('quantity check')
      quantity =  Number(Math.min(quantity, this.contractType === 'whitelist_1155' && isPresalePeriod ? this.maxPerTxWL : this.maxPerTx));
      console.log('quantity', quantity)

      console.log('max per wallet check')
      const maxPerWallet = this.contractType === 'whitelist_1155' && isPresalePeriod
          ? this.maxPerTxWL
          : this.maxPerTx

      console.log('maxPerWallet', maxPerWallet)

      if (quantity > maxPerWallet) {
        throw new Error(
          `You can't mint more than ${maxPerWallet} tokens in this transactions`
        );
      }

      if (!this.isSaleActive && !this.isPublicActive) {
        throw new Error("Collection is not on sale");
      }

      console.log('checking price')
      const price =
        isPresalePeriod
          ? this.salePrice
          : this.preSalePrice

      console.log('price', price)

      const amount = price.mul(quantity);

      console.log('amount', amount)

      // Presale minting
      if (this.contractType === 'whitelist_1155' && isPresalePeriod) {
        // Backwards compatibility with v2 contracts:
        // If the public sale is not active, we can still try mint with the presale

        console.log('minting thru whitelist')

        return await this._presale1155Mint(quantity, amount, Number(this.assetId), this.whitelistUrl);
      }

      // Regular minting
      return await this._standard1155Mint(quantity, amount, Number(this.assetId));
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
      if (this.contractType === "standard_721") {
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

    return trx.wait()

  }

  private async _presaleMint(
    quantity: number,
    amount: BigNumber,
    whitelistUrl: string
  ): Promise<ContractReceipt> {
    // const data = await this.generateProof();


    console.log('getting proof')
    const proof = await this.generateProofLocally(whitelistUrl);

    console.log('proof', proof)

    if(!proof?.length) {
      throw new Error("You are not in the whitelist.");
    }

    //TODO: Explore dynamic function name here later
    //Example: this.contract.this[functionName]()

    const trx: ContractTransaction = await this.contract.buyNFTsPresale(
      quantity,
      proof,
      {
        value: amount,
      }
    );

    return trx.wait();
  }

  private async _standard1155Mint(
    quantity: number,
    amount: BigNumber,
    tokenId: number
  ) {
    const trx: ContractTransaction = await this.contract.buyNFTsPublic(
      quantity,
      tokenId,
      {
        value: amount,
      }
    );

    return trx.wait();
  }

  private async _presale1155Mint(
    quantity: number,
    amount: BigNumber,
    tokenId: number,
    whitelistUrl: string
  ) {

    console.log('getting proof')
    const proof = await this.generateProofLocally(whitelistUrl);

    console.log('proof', proof)

    if(!proof?.length) {
      throw new Error("You are not in the whitelist.");
    }


    const trx: ContractTransaction = await this.contract.buyNFTsPresale(
      quantity,
      tokenId,
      proof,
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

  async initChainReader(
    dev: boolean,
    networkName: string,
    chainId: number,
    providerOptions: IProviderOptions,
    provider?: JsonRpcProvider,
  ) {

    const abi = abis[this.contractType || "standard_721"];

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

    return;
  }


  static async createChainReader(
    dev: boolean,
    networkName: string,
    chainId: number,
    providerOptions?: IProviderOptions,
    provider?: JsonRpcProvider,
  ): Promise<RfoxKit | null> {
    try {
      const rfoxKit = new RfoxKit();

      await rfoxKit.initChainReader(
        dev,
        networkName,
        chainId,
        providerOptions || PROVIDER_OPTIONS,
        provider,
      );

      return rfoxKit;
    } catch (error) {
      handleError(error as EthereumRpcError<unknown>);
      return null;
    }
  }

}
