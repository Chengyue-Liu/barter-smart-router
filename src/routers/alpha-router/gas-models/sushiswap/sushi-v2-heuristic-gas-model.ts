import { BigNumber } from '@ethersproject/bignumber';
import { Pair, Token } from '@sushiswap/sdk';
import { Token as QToken } from '@uniswap/sdk-core';
import _ from 'lodash';
import {
  sushiTokenToUniToken,
  sushiToUniCurrencyAmount,
  uniTokenArrToSushiTokenArr,
  uniTokenToSushiToken,
} from '../../../../adapter/sushi-adapter';
import { IV2PoolProvider } from '../../../../providers/interfaces/IPoolProvider';
import {
  ChainId,
  CurrencyAmount as QCurrencyAmount,
  log,
  SushiCurrencyAmount,
  WRAPPED_NATIVE_CURRENCY,
} from '../../../../util';
import { V2RouteWithValidQuote } from '../../entities/route-with-valid-quote';
import {
  IGasModel,
  IV2GasModelFactory,
  usdGasTokensByChain,
} from '../gas-model';

// Constant cost for doing any swap regardless of pools.
const BASE_SWAP_COST = BigNumber.from(115000);

// Constant per extra hop in the route.
const COST_PER_EXTRA_HOP = BigNumber.from(20000);

/**
 * Computes a gas estimate for a V2 swap using heuristics.
 * Considers number of hops in the route and the typical base cost for a swap.
 *
 * We compute gas estimates off-chain because
 *  1/ Calling eth_estimateGas for a swaps requires the caller to have
 *     the full balance token being swapped, and approvals.
 *  2/ Tracking gas used using a wrapper contract is not accurate with Multicall
 *     due to EIP-2929. We would have to make a request for every swap we wanted to estimate.
 *  3/ For V2 we simulate all our swaps off-chain so have no way to track gas used.
 *
 * Note, certain tokens e.g. rebasing/fee-on-transfer, may incur higher gas costs than
 * what we estimate here. This is because they run extra logic on token transfer.
 *
 * @export
 * @class V2HeuristicGasModelFactory
 */
export class SushiV2HeuristicGasModelFactory extends IV2GasModelFactory {
  constructor() {
    super();
  }

  public async buildGasModel(
    chainId: ChainId,
    gasPriceWei: BigNumber,
    poolProvider: IV2PoolProvider,
    token: QToken
  ): Promise<IGasModel<V2RouteWithValidQuote>> {
    if (token.equals(WRAPPED_NATIVE_CURRENCY[chainId]!)) {
      const usdPool: Pair = await this.getHighestLiquidityUSDPool(
        chainId,
        poolProvider
      );

      return {
        estimateGasCost: (routeWithValidQuote: V2RouteWithValidQuote) => {
          const { gasCostInEth, gasUse } = this.estimateGas(
            routeWithValidQuote,
            gasPriceWei,
            chainId
          );

          const ethToken0 =
            usdPool.token0.address == WRAPPED_NATIVE_CURRENCY[chainId]!.address;

          const ethTokenPrice = ethToken0
            ? usdPool.token0Price
            : usdPool.token1Price;

          const gasCostInTermsOfUSD: SushiCurrencyAmount = ethTokenPrice.quote(
            gasCostInEth
          ) as SushiCurrencyAmount;

          return {
            gasEstimate: gasUse,
            gasCostInToken: sushiToUniCurrencyAmount(gasCostInEth),
            gasCostInUSD: sushiToUniCurrencyAmount(gasCostInTermsOfUSD),
          };
        },
      };
    }

    // If the quote token is not WETH, we convert the gas cost to be in terms of the quote token.
    // We do this by getting the highest liquidity <token>/ETH pool.
    const ethPool: Pair | null = await this.getEthPool(
      chainId,
      token,
      poolProvider
    );
    if (!ethPool) {
      log.info(
        'Unable to find ETH pool with the quote token to produce gas adjusted costs. Route will not account for gas.'
      );
    }

    const usdPool: Pair = await this.getHighestLiquidityUSDPool(
      chainId,
      poolProvider
    );

    return {
      estimateGasCost: (routeWithValidQuote: V2RouteWithValidQuote) => {
        const usdToken =
          usdPool.token0.address == WRAPPED_NATIVE_CURRENCY[chainId]!.address
            ? usdPool.token1
            : usdPool.token0;

        const { gasCostInEth, gasUse } = this.estimateGas(
          routeWithValidQuote,
          gasPriceWei,
          chainId
        );

        if (!ethPool) {
          return {
            gasEstimate: gasUse,
            gasCostInToken: QCurrencyAmount.fromRawAmount(token, 0),
            gasCostInUSD: QCurrencyAmount.fromRawAmount(
              sushiTokenToUniToken(usdToken),
              0
            ),
          };
        }

        const ethToken0 =
          ethPool.token0.address == WRAPPED_NATIVE_CURRENCY[chainId]!.address;

        const ethTokenPrice = ethToken0
          ? ethPool.token0Price
          : ethPool.token1Price;

        let gasCostInTermsOfQuoteToken: SushiCurrencyAmount;
        try {
          gasCostInTermsOfQuoteToken = ethTokenPrice.quote(
            gasCostInEth
          ) as SushiCurrencyAmount;
        } catch (err) {
          log.error(
            {
              ethTokenPriceBase: ethTokenPrice.baseCurrency,
              ethTokenPriceQuote: ethTokenPrice.quoteCurrency,
              gasCostInEth: gasCostInEth.currency,
            },
            'Debug eth price token issue'
          );
          throw err;
        }

        const ethToken0USDPool =
          usdPool.token0.address == WRAPPED_NATIVE_CURRENCY[chainId]!.address;

        const ethTokenPriceUSDPool = ethToken0USDPool
          ? usdPool.token0Price
          : usdPool.token1Price;

        let gasCostInTermsOfUSD: SushiCurrencyAmount;
        try {
          gasCostInTermsOfUSD = ethTokenPriceUSDPool.quote(
            gasCostInEth
          ) as SushiCurrencyAmount;
        } catch (err) {
          log.error(
            {
              usdT1: usdPool.token0.symbol,
              usdT2: usdPool.token1.symbol,
              gasCostInEthToken: gasCostInEth.currency.symbol,
            },
            'Failed to compute USD gas price'
          );
          throw err;
        }

        return {
          gasEstimate: gasUse,
          gasCostInToken: sushiToUniCurrencyAmount(gasCostInTermsOfQuoteToken),
          gasCostInUSD: sushiToUniCurrencyAmount(gasCostInTermsOfUSD!),
        };
      },
    };
  }

  private estimateGas(
    routeWithValidQuote: V2RouteWithValidQuote,
    gasPriceWei: BigNumber,
    chainId: ChainId
  ) {
    const hops = routeWithValidQuote.route.pairs.length;
    const gasUse = BASE_SWAP_COST.add(COST_PER_EXTRA_HOP.mul(hops - 1));

    const totalGasCostWei = gasPriceWei.mul(gasUse);

    const weth = WRAPPED_NATIVE_CURRENCY[chainId]!;

    const gasCostInEth = SushiCurrencyAmount.fromRawAmount(
      uniTokenToSushiToken(weth),
      totalGasCostWei.toString()
    );

    return { gasCostInEth, gasUse };
  }

  private async getEthPool(
    chainId: ChainId,
    token: QToken,
    poolProvider: IV2PoolProvider
  ): Promise<Pair | null> {
    const weth = WRAPPED_NATIVE_CURRENCY[chainId]!;

    const poolAccessor = await poolProvider.getPools([
      [uniTokenToSushiToken(weth), uniTokenToSushiToken(token)],
    ]);
    const pool = poolAccessor.getPool(weth, token);

    if (!pool || pool.reserve0.equalTo(0) || pool.reserve1.equalTo(0)) {
      log.error(
        {
          weth,
          token,
          reserve0: pool?.reserve0.toExact(),
          reserve1: pool?.reserve1.toExact(),
        },
        `Could not find a valid WETH pool with ${token.symbol} for computing gas costs.`
      );

      return null;
    }

    return pool;
  }

  private async getHighestLiquidityUSDPool(
    chainId: ChainId,
    poolProvider: IV2PoolProvider
  ): Promise<Pair> {
    const usdTokens = usdGasTokensByChain[chainId];

    if (!usdTokens) {
      throw new Error(
        `Could not find a USD token for computing gas costs on ${chainId}`
      );
    }
    let sushiUsdTokens: Token[] = uniTokenArrToSushiTokenArr(usdTokens);
    const usdPools = _.map<Token, [Token, Token]>(
      sushiUsdTokens,
      (usdToken) => [
        usdToken,
        uniTokenToSushiToken(WRAPPED_NATIVE_CURRENCY[chainId]!),
      ]
    );
    const poolAccessor = await poolProvider.getPools(usdPools);
    const poolsRaw = poolAccessor.getAllPools();
    const pools = _.filter(
      poolsRaw,
      (pool) => pool.reserve0.greaterThan(0) && pool.reserve1.greaterThan(0)
    );

    if (pools.length == 0) {
      log.error(
        { pools },
        `Could not find a USD/WETH pool for computing gas costs.`
      );
      throw new Error(`Can't find USD/WETH pool for computing gas costs.`);
    }

    const maxPool = _.maxBy(pools, (pool) => {
      if (pool.token0.equals(WRAPPED_NATIVE_CURRENCY[chainId]!)) {
        return parseFloat(pool.reserve0.toSignificant(2));
      } else {
        return parseFloat(pool.reserve1.toSignificant(2));
      }
    }) as Pair;

    return maxPool;
  }
}
