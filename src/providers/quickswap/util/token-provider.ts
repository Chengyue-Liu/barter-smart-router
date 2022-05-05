import { ChainId } from '@davidwgrossman/quickswap-sdk';
import _ from 'lodash';
import { IERC20Metadata__factory } from '../../../types/v3';
import { log } from '../../../util';
import { Token } from '../../../util/token';
import { IMulticallProvider } from './../../multicall-provider';
import { ProviderConfig } from './../../provider';

/**
 * Provider for getting token data.
 *
 * @export
 * @interface ITokenProvider
 */
export interface ITokenProvider {
  /**
   * Gets the token at each address. Any addresses that are not valid ERC-20 are ignored.
   *
   * @param addresses The token addresses to get.
   * @param [providerConfig] The provider config.
   * @returns A token accessor with methods for accessing the tokens.
   */
  getTokens(
    addresses: string[],
    providerConfig?: ProviderConfig
  ): Promise<TokenAccessor>;
}

export type TokenAccessor = {
  getTokenByAddress(address: string): Token | undefined;
  getTokenBySymbol(symbol: string): Token | undefined;
  getAllTokens: () => Token[];
};

//MATIC tokens
export const WMATIC_MATIC = new Token(
  ChainId.MATIC,
  '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  18,
  'WMATIC',
  'Wrapped MATIC'
);

export const WETH_MATIC = new Token(
  ChainId.MATIC,
  '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
  18,
  'WETH',
  'Wrapped Ether'
);

export const USDC_MATIC = new Token(
  ChainId.MATIC,
  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
  6,
  'USDC',
  'USD//C'
);
export const USDT_MATIC = new Token(
  ChainId.MATIC,
  '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  6,
  'USDT',
  'Tether'
);
export const DAI_MATIC = new Token(
  ChainId.MATIC,
  '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  18,
  'DAI',
  'Dai Stablecoin'
);

//MATIC mumbai tokens
export const WMATIC_MATIC_TESTNET = new Token(
  ChainId.MUMBAI,
  '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
  18,
  'WMATIC',
  'Wrapped MATIC'
);

export const USDC_MATIC_TESTNET = new Token(
  ChainId.MUMBAI,
  '0xe11a86849d99f524cac3e7a0ec1241828e332c62',
  6,
  'USDC',
  'USD//C'
);

export const DAI_MATIC_TESTNET = new Token(
  ChainId.MUMBAI,
  '0x001b3b4d0f3714ca98ba10f6042daebf0b1b7b6f',
  18,
  'DAI',
  'Dai Stablecoin'
);

export class TokenProvider implements ITokenProvider {
  constructor(
    private chainId: ChainId,
    protected multicall2Provider: IMulticallProvider
  ) {}

  public async getTokens(
    _addresses: string[],
    providerConfig?: ProviderConfig
  ): Promise<TokenAccessor> {
    const addressToToken: { [address: string]: Token } = {};
    const symbolToToken: { [symbol: string]: Token } = {};

    const addresses = _(_addresses)
      .map((address) => address.toLowerCase())
      .uniq()
      .value();

    if (addresses.length > 0) {
      const [symbolsResult, decimalsResult] = await Promise.all([
        this.multicall2Provider.callSameFunctionOnMultipleContracts<
          undefined,
          [string]
        >({
          addresses,
          contractInterface: IERC20Metadata__factory.createInterface(),
          functionName: 'symbol',
          providerConfig,
        }),
        this.multicall2Provider.callSameFunctionOnMultipleContracts<
          undefined,
          [number]
        >({
          addresses,
          contractInterface: IERC20Metadata__factory.createInterface(),
          functionName: 'decimals',
          providerConfig,
        }),
      ]);

      const { results: symbols } = symbolsResult;
      const { results: decimals } = decimalsResult;

      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i]!;

        const symbolResult = symbols[i];
        const decimalResult = decimals[i];

        if (!symbolResult?.success || !decimalResult?.success) {
          log.info(
            {
              symbolResult,
              decimalResult,
            },
            `Dropping token with address ${address} as symbol or decimal are invalid`
          );
          continue;
        }

        const symbol = symbolResult.result[0]!;
        const decimal = decimalResult.result[0]!;

        addressToToken[address.toLowerCase()] = new Token(
          this.chainId,
          address,
          decimal,
          symbol
        );
        symbolToToken[symbol.toLowerCase()] =
          addressToToken[address.toLowerCase()]!;
      }

      log.info(
        `Got token symbol and decimals for ${
          Object.values(addressToToken).length
        } out of ${addresses.length} tokens on-chain ${
          providerConfig ? `as of: ${providerConfig?.blockNumber}` : ''
        }`
      );
    }

    return {
      getTokenByAddress: (address: string): Token | undefined => {
        return addressToToken[address.toLowerCase()];
      },
      getTokenBySymbol: (symbol: string): Token | undefined => {
        return symbolToToken[symbol.toLowerCase()];
      },
      getAllTokens: (): Token[] => {
        return Object.values(addressToToken);
      },
    };
  }
}
