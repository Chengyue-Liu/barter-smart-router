import { ChainId } from '@davidwgrossman/quickswap-sdk';
import { Token } from '../../../util/token';
export enum ChainName {
  // ChainNames match infura network strings
  POLYGON = 'polygon-mainnet',
  POLYGON_MUMBAI = 'polygon-mumbai',
}

export enum NativeCurrencyName {
  // Strings match input for CLI
  MATIC = 'MATIC',
}

export const NATIVE_CURRENCY: { [chainId: number]: NativeCurrencyName } = {
  [ChainId.MATIC]: NativeCurrencyName.MATIC,
  [ChainId.MUMBAI]: NativeCurrencyName.MATIC,
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
  [ChainId.MATIC]: new Token(
    ChainId.MATIC,
    '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    18,
    'WMATIC',
    'Wrapped MATIC'
  ),
  [ChainId.MUMBAI]: new Token(
    ChainId.MUMBAI,
    '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
    18,
    'WMATIC',
    'Wrapped MATIC'
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
