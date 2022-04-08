import { ChainId, Token } from '@pancakeswap/sdk';

export enum ChainName {
  // ChainNames match infura network strings
  POLYGON = 'polygon-mainnet',
  POLYGON_MUMBAI = 'polygon-mumbai',
}

export enum NativeCurrencyName {
  // Strings match input for CLI
  MAINNET = 'MAINNET',
  TESTNET = 'TESTNET',
}

export const NATIVE_CURRENCY: { [chainId: number]: NativeCurrencyName } = {
  [ChainId.MAINNET]: NativeCurrencyName.MAINNET,
  [ChainId.TESTNET]: NativeCurrencyName.TESTNET,
};

export const ID_TO_NETWORK_NAME = (id: number): ChainName => {
  switch (id) {
    case 137:
      return ChainName.POLYGON;
    case 80001:
      return ChainName.POLYGON_MUMBAI;
    default:
      throw new Error(`Unknown chain id: ${id}`);
  }
};

export const CHAIN_IDS_LIST = Object.values(ChainId).map((c) =>
  c.toString()
) as string[];

export const WRAPPED_NATIVE_CURRENCY: { [chainId in ChainId]: Token } = {
  [ChainId.MAINNET]: new Token(
    ChainId.MAINNET,
    '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    18,
    'WBNB',
    'Wrapped BNB'
  ),
  [ChainId.TESTNET]: new Token(
    ChainId.TESTNET,
    '0x094616F0BdFB0b526bD735Bf66Eca0Ad254ca81F',
    18,
    'WBNB',
    'Wrapped BNB'
  ),
};

// function isMatic(chainId: number): chainId is ChainId.MATIC | ChainId.MUMBAI {
//   return chainId === ChainId.MUMBAI || chainId === ChainId.MATIC;
// }

// class MaticNativeCurrency extends NativeCurrency {
//   equals(other: Currency): boolean {
//     return other.isNative && other.chainId === this.chainId;
//   }

//   get wrapped(): Token {
//     if (!isMatic(this.chainId)) throw new Error('Not matic');
//     const nativeCurrency = WRAPPED_NATIVE_CURRENCY[this.chainId];
//     if (nativeCurrency) {
//       return nativeCurrency;
//     }
//     throw new Error(`Does not support this chain ${this.chainId}`);
//   }

//   public constructor(chainId: number) {
//     if (!isMatic(chainId)) throw new Error('Not matic');
//     super(chainId, 18, 'MATIC', 'Polygon Matic');
//   }
// }

// export class ExtendedEther extends Ether {
//   public get wrapped(): Token {
//     if (this.chainId in WRAPPED_NATIVE_CURRENCY)
//       return WRAPPED_NATIVE_CURRENCY[this.chainId as ChainId];
//     throw new Error('Unsupported chain ID');
//   }

//   private static _cachedExtendedEther: { [chainId: number]: NativeCurrency } =
//     {};

//   public static onChain(chainId: number): ExtendedEther {
//     return (
//       this._cachedExtendedEther[chainId] ??
//       (this._cachedExtendedEther[chainId] = new ExtendedEther(chainId))
//     );
//   }
// }

// const cachedNativeCurrency: { [chainId: number]: NativeCurrency } = {};
// export function nativeOnChain(chainId: number): NativeCurrency {
//   return (
//     cachedNativeCurrency[chainId] ??
//     (cachedNativeCurrency[chainId] = isMatic(chainId)
//       ? new MaticNativeCurrency(chainId)
//       : ExtendedEther.onChain(chainId))
//   );
// }
