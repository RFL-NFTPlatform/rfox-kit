# RFOX Kit

JavaScript SDK library built with Typescript that provides an interface for RFOX Nft Kits.

## Installation

1. Install via npm

```bash
npm install @rfl-nftplatform/rfox-kit
```

2. Import via CDN

```html
<script src="https://unpkg.com/@rfoxlabs/rfox-kit/dist/umd/index.js"></script>
```

## Example

```html
<!-- Import DropKit.js library -->
<script src="https://unpkg.com/@rfoxlabs/rfox-kit/dist/umd/index.js"></script>

<script>
  document.getElementById('mint_btn').onclick = async function mint() {
    const kit = await RfoxKit.create(collectionAddress, collectionId, contractType, networkName, chainId, maxSupply, providers); // Supply Collection Details here
    await kit.mint(1); // Number of NFTs to mint
  }
</script>
```

## Enable Multiple Providers (Wallets)

This package uses [Web3modal](https://github.com/Web3Modal/web3modal), which allows you to connect to multiple wallets.
See the [Providers Options](https://github.com/Web3Modal/web3modal#provider-options)

You can add your custom providers into the `create` method like this:

```typescript
import Torus from '@toruslabs/torus-embed'
import WalletConnectProvider from '@walletconnect/web3-provider'
import WalletLink from 'walletlink'

const providers = {
  walletconnect: {
    package: WalletConnectProvider,
    options: {
      infuraId: YOUR_INFURA_ID,
    },
  },
  torus: {
    package: Torus,
  },
  walletlink: {
    package: WalletLink,
    options: {
      infuraId: YOUR_INFURA_ID,
    },
  },
}

// and then init the Dropkit instance
const rfoxKit = await RfoxKit.create(collectionAddress, collectionId, contractType, networkName, chainId, maxSupply, providers);
```

## Use Custom Provider

You can optionally pass in a custom provider to the `create` method, which will be used instead of the `Web3Provider`.

```typescript
import { ethers } from 'ethers';

const provider = new ethers.providers.JsonRpcProvider(
    'YOUR_RPC_URL',
);

const isDev = false;

const web3ModalProviders = {
  walletconnect: {
    package: WalletConnectProvider,
    options: {
      infuraId: YOUR_INFURA_ID,
    },
  },
  torus: {
    package: Torus,
  },
  walletlink: {
    package: WalletLink,
    options: {
      infuraId: YOUR_INFURA_ID,
    },
  },
}

const rfoxKit = await RfoxKit.create(collectionAddress, collectionId, contractType, networkName, chainId, maxSupply, providers);
```

## API

```typescript
class RfoxKit {
    dev?: boolean;
    address: string;
    collectionId?: string;
    contract: Contract;
    walletAddress?: string;
    contractType: string;
    maxSupply?: number;
    provider: Web3Provider | JsonRpcProvider;
    signer: JsonRpcSigner;
    ethInstance: any;
    chainId: number;
    networkName: string;
    private get apiBaseUrl();
    constructor();
    init(contractAddress: string, collectionId: string, contractType: string, networkName: string, chainId: number, maxSupply: number, providerOptions: IProviderOptions, provider?: JsonRpcProvider): Promise<void>;
    static create(contractAddress: string, collectionId: string, contractType: string, networkName: string, chainId: number, maxSupply: number, providerOptions?: IProviderOptions, provider?: JsonRpcProvider): Promise<RfoxKit | null>;
    price(): Promise<BigNumber>;
    pricePreSale(): Promise<BigNumber>;
    maxAmount(): Promise<number>;
    maxPerMint(): Promise<number>;
    maxPerMintPresale(): Promise<number>;
    totalSupply(): Promise<number>;
    saleActive(): Promise<boolean>;
    publicActive(): Promise<boolean>;
    generateProof(): Promise<ProofApiResponse & ErrorApiResponse>;
    mint(quantity: number): Promise<ContractReceipt | null>;
    private _mint;
    private _presaleMint;
    private _initProvider;
    private _checkNetwork;
}
```