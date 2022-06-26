import { BigNumber } from "ethers";

export type DataToken = {
  tokenID: number;
  maxTokensPerTransaction: number;
  tokenPrice: BigNumber;
  maxSupply: number;
  saleStartTime: number;
  saleEndTime: number;
  saleToken: string;
  active: boolean;
}

export type DataTokenPresale = {
  publicSaleStartTime: number;
  maxMintedPresalePerAddress: number;
  tokenPricePresale: BigNumber;
  merkleRoot: string;
}