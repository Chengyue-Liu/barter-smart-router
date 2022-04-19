import { Pair } from '@pancakeswap/sdk';
import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { Currency, Fraction, Token, TradeType } from '@uniswap/sdk-core';
import { Position } from '@uniswap/v3-sdk';
import { default as retry } from 'async-retry';
import { BigNumber, providers } from 'ethers';
import _ from 'lodash';
import NodeCache from 'node-cache';
import {
  pancakeTokensToUniTokens,
  pancakeTokenToUniToken,
  pancakeToUniCurrencyAmount,
  toPancakeCurrencyAmountArr,
  toPancakeRouteArr,
  toUniPairArr,
} from '../../adapter/pancake-adapter';
import {
  CachingGasStationProvider,
  CachingTokenProviderWithFallback,
  ISwapRouterProvider,
  ITokenProvider,
  LegacyGasPriceProvider,
  NodeJSCache,
  TokenProvider,
} from '../../providers';
import {
  CachingTokenListProvider,
  ITokenListProvider,
} from '../../providers/caching-token-list-provider';
import {
  GasPrice,
  IGasPriceProvider,
} from '../../providers/gas-price-provider';
import { IV2PoolProvider } from '../../providers/interfaces/IPoolProvider';
import {
  IV2SubgraphProvider,
  RawBNBV2SubgraphPool,
} from '../../providers/interfaces/ISubgraphProvider';
import { BSCMulticallProvider } from '../../providers/multicall-bsc-provider';
import { PancakeV2PoolProvider } from '../../providers/pancakeswap/v2/pool-provider';
import {
  IPancakeV2QuoteProvider,
  PancakeV2QuoteProvider,
} from '../../providers/pancakeswap/v2/quote-provider';
import { PancakeSubgraphProvider } from '../../providers/pancakeswap/v2/subgraph-provider';
import {
  ITokenValidatorProvider,
  TokenValidationResult,
} from '../../providers/token-validator-provider';
import {
  IL2GasDataProvider,
  OptimismGasData,
} from '../../providers/uniswap/v3/gas-data-provider';
import { poolToString, routeToString } from '../../util';
import { CurrencyAmount } from '../../util/amounts';
import { ChainId, ID_TO_NETWORK_NAME } from '../../util/chains';
import { log } from '../../util/log';
import { metric, MetricLoggerUnit } from '../../util/metric';
import { getBSCPoolsByHttp, getBSCPoolsFromOneProtocol } from '../../util/pool';
import { BarterProtocol } from '../../util/protocol';
import {
  IRouter,
  ISwapToRatio,
  SwapAndAddConfig,
  SwapAndAddOptions,
  SwapOptions,
  SwapRoute,
  SwapToRatioResponse,
} from '../router';
import {
  RouteWithValidQuote,
  V2RouteWithValidQuote,
} from './entities/route-with-valid-quote';
import { getBestSwapRoute } from './functions/best-swap-route';
import { computeAllV2Routes } from './functions/compute-all-routes';
import { CandidatePoolsBySelectionCriteria } from './functions/get-candidate-pools';
import { getPancakeV2CandidatePools } from './functions/get-pancake-candidate-pools';
import { IV2GasModelFactory } from './gas-models/gas-model';
import { PancakeV2HeuristicGasModelFactory } from './gas-models/pancakeswap/pancake-v2-heuristic-gas-model';

export type BSCAlphaRouterParams = {
  /**
   * The chain id for this instance of the Alpha Router.
   */
  chainId: ChainId;
  /**
   * The Web3 provider for getting on-chain data.
   */
  provider: providers.BaseProvider;
  /**
   * The provider to use for making multicalls. Used for getting on-chain data
   * like pools, tokens, quotes in batch.
   */
  multicall2Provider?: BSCMulticallProvider;

  pancakeV2SubgraphProvider?: IV2SubgraphProvider;
  /**
   * The provider for getting data about V2 pools.
   */
  pancakeV2PoolProvider?: IV2PoolProvider;

  pancakeV2QuoteProvider?: IPancakeV2QuoteProvider;
  /**
   * The provider for getting data about Tokens.
   */
  tokenProvider?: ITokenProvider;
  /**
   * The provider for getting the current gas price to use when account for gas in the
   * algorithm.
   */
  gasPriceProvider?: IGasPriceProvider;
  /**
   *
   */
  pancakeV2GasModelFactory?: IV2GasModelFactory;

  /**
   * Calls lens function on SwapRouter02 to determine ERC20 approval types for
   * LP position tokens.
   */
  swapRouterProvider?: ISwapRouterProvider;

  /**
   * Calls the optimism gas oracle contract to fetch constants for calculating the l1 security fee.
   */
  optimismGasDataProvider?: IL2GasDataProvider<OptimismGasData>;

  /**
   * A token validator for detecting fee-on-transfer tokens or tokens that can't be transferred.
   */
  tokenValidatorProvider?: ITokenValidatorProvider;
};

/**
 * Determines the pools that the algorithm will consider when finding the optimal swap.
 *
 * All pools on each protocol are filtered based on the heuristics specified here to generate
 * the set of candidate pools. The Top N pools are taken by Total Value Locked (TVL).
 *
 * Higher values here result in more pools to explore which results in higher latency.
 */
export type ProtocolPoolSelection = {
  /**
   * The top N pools by TVL out of all pools on the protocol.
   */
  topN: number;
  /**
   * The top N pools by TVL of pools that consist of tokenIn and tokenOut.
   */
  topNDirectSwaps: number;
  /**
   * The top N pools by TVL of pools where one token is tokenIn and the
   * top N pools by TVL of pools where one token is tokenOut tokenOut.
   */
  topNTokenInOut: number;
  /**
   * Given the topNTokenInOut pools, gets the top N pools that involve the other token.
   * E.g. for a WETH -> USDC swap, if topNTokenInOut found WETH -> DAI and WETH -> USDT,
   * a value of 2 would find the top 2 pools that involve DAI or USDT.
   */
  topNSecondHop: number;
  /**
   * The top N pools for token in and token out that involve a token from a list of
   * hardcoded 'base tokens'. These are standard tokens such as WETH, USDC, DAI, etc.
   * This is similar to how the legacy routing algorithm used by Uniswap would select
   * pools and is intended to make the new pool selection algorithm close to a superset
   * of the old algorithm.
   */
  topNWithEachBaseToken: number;
  /**
   * Given the topNWithEachBaseToken pools, takes the top N pools from the full list.
   * E.g. for a WETH -> USDC swap, if topNWithEachBaseToken found WETH -0.05-> DAI,
   * WETH -0.01-> DAI, WETH -0.05-> USDC, WETH -0.3-> USDC, a value of 2 would reduce
   * this set to the top 2 pools from that full list.
   */
  topNWithBaseToken: number;
};

export type AlphaRouterConfig = {
  /**
   * The block number to use for all on-chain data. If not provided, the router will
   * use the latest block returned by the provider.
   */
  blockNumber?: number | Promise<number>;
  /**
   * The protocols to consider when finding the optimal swap. If not provided all protocols
   * will be used.
   */
  protocols?: BarterProtocol[];
  /**
   * Config for selecting which pools to consider routing via on V2.
   */
  v2PoolSelection: ProtocolPoolSelection;
  /**
   * Config for selecting which pools to consider routing via on V3.
   */
  v3PoolSelection: ProtocolPoolSelection;
  /**
   * For each route, the maximum number of hops to consider. More hops will increase latency of the algorithm.
   */
  maxSwapsPerPath: number;
  /**
   * The maximum number of splits in the returned route. A higher maximum will increase latency of the algorithm.
   */
  maxSplits: number;
  /**
   * The minimum number of splits in the returned route.
   * This parameters should always be set to 1. It is only included for testing purposes.
   */
  minSplits: number;
  /**
   * Forces the returned swap to route across all protocols.
   * This parameter should always be false. It is only included for testing purposes.
   */
  forceCrossProtocol: boolean;
  /**
   * The minimum percentage of the input token to use for each route in a split route.
   * All routes will have a multiple of this value. For example is distribution percentage is 5,
   * a potential return swap would be:
   *
   * 5% of input => Route 1
   * 55% of input => Route 2
   * 40% of input => Route 3
   */
  distributionPercent: number;
};

export class BSCAlphaRouter
  implements
    IRouter<AlphaRouterConfig>,
    ISwapToRatio<AlphaRouterConfig, SwapAndAddConfig>
{
  protected chainId: ChainId;
  protected provider: providers.BaseProvider;
  protected multicall2Provider: BSCMulticallProvider;
  protected pancakeV2SubgraphProvider: IV2SubgraphProvider;
  protected pancakeV2PoolProvider: IV2PoolProvider;
  protected pancakeV2QuoteProvider: IPancakeV2QuoteProvider;
  protected tokenProvider: ITokenProvider;
  protected tokenValidatorProvider?: ITokenValidatorProvider;
  protected blockedTokenListProvider?: ITokenListProvider;
  protected gasPriceProvider: IGasPriceProvider;
  protected pancakeV2GasModelFactory: IV2GasModelFactory;

  constructor({
    chainId,
    provider,
    multicall2Provider,
    pancakeV2PoolProvider,
    pancakeV2QuoteProvider,
    pancakeV2SubgraphProvider,
    tokenProvider,
    gasPriceProvider,
    pancakeV2GasModelFactory,
  }: BSCAlphaRouterParams) {
    this.chainId = chainId;
    this.provider = provider;
    this.multicall2Provider =
      multicall2Provider ?? new BSCMulticallProvider(56, provider, 375_000);
    this.pancakeV2PoolProvider =
      pancakeV2PoolProvider ??
      new PancakeV2PoolProvider(56, this.multicall2Provider);

    this.pancakeV2QuoteProvider =
      pancakeV2QuoteProvider ?? new PancakeV2QuoteProvider();

    const chainName = ID_TO_NETWORK_NAME(chainId);

    this.pancakeV2SubgraphProvider =
      pancakeV2SubgraphProvider ?? new PancakeSubgraphProvider(56);

    if (this.provider instanceof providers.JsonRpcProvider) {
      this.gasPriceProvider =
        gasPriceProvider ??
        new CachingGasStationProvider(
          chainId,
          new LegacyGasPriceProvider(this.provider),
          new NodeJSCache<GasPrice>(
            new NodeCache({ stdTTL: 15, useClones: false })
          )
        );
    } else {
      throw new Error('only json rpc provider is supported');
    }

    this.tokenProvider =
      tokenProvider ??
      new CachingTokenProviderWithFallback(
        chainId,
        new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false })),
        new CachingTokenListProvider(
          chainId,
          DEFAULT_TOKEN_LIST,
          new NodeJSCache(new NodeCache({ stdTTL: 3600, useClones: false }))
        ),
        new TokenProvider(56, this.multicall2Provider)
      );
    this.pancakeV2GasModelFactory =
      pancakeV2GasModelFactory ?? new PancakeV2HeuristicGasModelFactory();
  }

  routeToRatio(
    token0Balance: CurrencyAmount,
    token1Balance: CurrencyAmount,
    position: Position,
    swapAndAddConfig: SwapAndAddConfig,
    swapAndAddOptions?: SwapAndAddOptions,
    routingConfig?: AlphaRouterConfig
  ): Promise<SwapToRatioResponse> {
    throw new Error('Method not implemented.');
  }

  /**
   * @inheritdoc IRouter
   */
  public async route(
    amount: CurrencyAmount,
    quoteCurrency: Currency,
    tradeType: TradeType,
    swapConfig?: SwapOptions,
    partialRoutingConfig: Partial<AlphaRouterConfig> = {}
  ): Promise<SwapRoute | null> {
    metric.putMetric(
      `QuoteRequestedForChain${this.chainId}`,
      1,
      MetricLoggerUnit.Count
    );

    // Get a block number to specify in all our calls. Ensures data we fetch from chain is
    // from the same block.
    const blockNumber =
      partialRoutingConfig.blockNumber ?? this.getBlockNumberPromise();

    const routingConfig: AlphaRouterConfig = _.merge(
      {},
      {
        v2PoolSelection: {
          topN: 3,
          topNDirectSwaps: 1,
          topNTokenInOut: 5,
          topNSecondHop: 2,
          topNWithEachBaseToken: 2,
          topNWithBaseToken: 6,
        },
        v3PoolSelection: {
          topN: 2,
          topNDirectSwaps: 2,
          topNTokenInOut: 3,
          topNSecondHop: 1,
          topNWithEachBaseToken: 3,
          topNWithBaseToken: 5,
        },
        maxSwapsPerPath: 3,
        minSplits: 1,
        maxSplits: 7,
        distributionPercent: 5,
        forceCrossProtocol: false,
      },
      partialRoutingConfig,
      { blockNumber }
    );

    const { protocols } = routingConfig;

    const currencyIn =
      tradeType == TradeType.EXACT_INPUT ? amount.currency : quoteCurrency;
    const currencyOut =
      tradeType == TradeType.EXACT_INPUT ? quoteCurrency : amount.currency;
    const tokenIn = currencyIn.wrapped;
    const tokenOut = currencyOut.wrapped;

    // Generate our distribution of amounts, i.e. fractions of the input amount.
    // We will get quotes for fractions of the input amount for different routes, then
    // combine to generate split routes.
    const [percents, amounts] = this.getAmountDistribution(
      amount,
      routingConfig
    );

    // Get an estimate of the gas price to use when estimating gas cost of different routes.
    const beforeGas = Date.now();
    const { gasPriceWei } = await this.gasPriceProvider.getGasPrice();

    metric.putMetric(
      'GasPriceLoad',
      Date.now() - beforeGas,
      MetricLoggerUnit.Milliseconds
    );

    const quoteToken = quoteCurrency.wrapped;

    const quotePromises: Promise<{
      routesWithValidQuotes: RouteWithValidQuote[];
      candidatePools: CandidatePoolsBySelectionCriteria;
    }>[] = [];

    const protocolsSet = new Set(protocols ?? []);

    const allPoolsUnsanitizedJsonStr = await getBSCPoolsByHttp(
      protocolsSet,
      this.chainId
    );

    let pancakePoolsUnsanitized: RawBNBV2SubgraphPool[] =
      getBSCPoolsFromOneProtocol(
        allPoolsUnsanitizedJsonStr,
        BarterProtocol.PANCAKESWAP
      );

    if (pancakePoolsUnsanitized === undefined) {
      console.error('pancake pool not found on server');
      pancakePoolsUnsanitized = [];
    }
    if (protocolsSet.has(BarterProtocol.PANCAKESWAP)) {
      quotePromises.push(
        this.getPancakeQuotes(
          tokenIn,
          tokenOut,
          amounts,
          percents,
          quoteToken,
          gasPriceWei,
          tradeType,
          routingConfig,
          pancakePoolsUnsanitized
        )
      );
    }
    let start = Date.now();
    const routesWithValidQuotesByProtocol = await Promise.all(quotePromises);
    console.log('wait for quote', Date.now() - start);
    let allRoutesWithValidQuotes: RouteWithValidQuote[] = [];
    let allCandidatePools: CandidatePoolsBySelectionCriteria[] = [];
    for (const {
      routesWithValidQuotes,
      candidatePools,
    } of routesWithValidQuotesByProtocol) {
      allRoutesWithValidQuotes = [
        ...allRoutesWithValidQuotes,
        ...routesWithValidQuotes,
      ];
      allCandidatePools = [...allCandidatePools, candidatePools];
    }
    if (allRoutesWithValidQuotes.length == 0) {
      log.info({ allRoutesWithValidQuotes }, 'Received no valid quotes');
      return null;
    }
    // Given all the quotes for all the amounts for all the routes, find the best combination.
    const beforeBestSwap = Date.now();
    const swapRouteRaw = await getBestSwapRoute(
      amount,
      percents,
      allRoutesWithValidQuotes,
      tradeType,
      this.chainId,
      routingConfig
    );

    if (!swapRouteRaw) {
      return null;
    }

    const {
      quote,
      quoteGasAdjusted,
      estimatedGasUsed,
      routes: routeAmounts,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedUSD,
    } = swapRouteRaw;

    return {
      quote,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedUSD,
      gasPriceWei,
      route: routeAmounts,
      blockNumber: BigNumber.from(await blockNumber),
    };
  }

  private async getPancakeQuotes(
    tokenIn: Token,
    tokenOut: Token,
    amounts: CurrencyAmount[],
    percents: number[],
    quoteToken: Token,
    gasPriceWei: BigNumber,
    swapType: TradeType,
    routingConfig: AlphaRouterConfig,
    allPoolsUnsanitized: RawBNBV2SubgraphPool[]
  ): Promise<{
    routesWithValidQuotes: V2RouteWithValidQuote[];
    candidatePools: CandidatePoolsBySelectionCriteria;
  }> {
    log.info('Starting to get V2 quotes');
    // Fetch all the pools that we will consider routing via. There are thousands
    // of pools, so we filter them to a set of candidate pools that we expect will
    // result in good prices.
    let start = Date.now();

    const { poolAccessor, candidatePools } = await getPancakeV2CandidatePools({
      tokenIn,
      tokenOut,
      tokenProvider: this.tokenProvider,
      blockedTokenListProvider: this.blockedTokenListProvider,
      poolProvider: this.pancakeV2PoolProvider,
      routeType: swapType,
      subgraphProvider: this.pancakeV2SubgraphProvider,
      allPoolsUnsanitized,
      routingConfig,
      chainId: this.chainId,
    });
    console.log('get candidate', Date.now() - start);
    const poolsRaw = poolAccessor.getAllPools();
    // Drop any pools that contain tokens that can not be transferred according to the token validator.
    const pools = await this.applyTokenValidatorToPools(
      poolsRaw,
      (
        token: Currency,
        tokenValidation: TokenValidationResult | undefined
      ): boolean => {
        // If there is no available validation result we assume the token is fine.
        if (!tokenValidation) {
          return false;
        }

        // Only filters out *intermediate* pools that involve tokens that we detect
        // cant be transferred. This prevents us trying to route through tokens that may
        // not be transferrable, but allows users to still swap those tokens if they
        // specify.
        if (
          tokenValidation == TokenValidationResult.STF &&
          (token.equals(tokenIn) || token.equals(tokenOut))
        ) {
          return false;
        }

        return tokenValidation == TokenValidationResult.STF;
      }
    );

    // Given all our candidate pools, compute all the possible ways to route from tokenIn to tokenOut.
    const { maxSwapsPerPath } = routingConfig;
    const routes = computeAllV2Routes(
      tokenIn,
      tokenOut,
      toUniPairArr(pools),
      maxSwapsPerPath
    );
    if (routes.length == 0) {
      return { routesWithValidQuotes: [], candidatePools };
    }

    // For all our routes, and all the fractional amounts, fetch quotes on-chain.
    const quoteFn =
      swapType == TradeType.EXACT_INPUT
        ? this.pancakeV2QuoteProvider.getQuotesManyExactIn.bind(
            this.pancakeV2QuoteProvider
          )
        : this.pancakeV2QuoteProvider.getQuotesManyExactOut.bind(
            this.pancakeV2QuoteProvider
          );

    const beforeQuotes = Date.now();
    log.info(
      `Getting quotes for V2 for ${routes.length} routes with ${amounts.length} amounts per route.`
    );

    const { routesWithQuotes } = await quoteFn(
      toPancakeCurrencyAmountArr(amounts),
      toPancakeRouteArr(routes)
    );
    start = Date.now();
    const gasModel = await this.pancakeV2GasModelFactory.buildGasModel(
      this.chainId,
      gasPriceWei,
      this.pancakeV2PoolProvider,
      quoteToken
    );
    console.log('build gas', Date.now() - start);

    metric.putMetric(
      'V2QuotesLoad',
      Date.now() - beforeQuotes,
      MetricLoggerUnit.Milliseconds
    );

    metric.putMetric(
      'V2QuotesFetched',
      _(routesWithQuotes)
        .map(([, quotes]) => quotes.length)
        .sum(),
      MetricLoggerUnit.Count
    );

    const routesWithValidQuotes = [];
    for (const routeWithQuote of routesWithQuotes) {
      const [route, quotes] = routeWithQuote;
      for (let i = 0; i < quotes.length; i++) {
        const percent = percents[i]!;
        const amountQuote = quotes[i]!;
        const { quote, amount } = amountQuote;
        if (!quote) {
          log.debug(
            {
              route: routeToString(route),
              amountQuote,
            },
            'Dropping a null V2 quote for route.'
          );
          continue;
        }
        const uAmount = pancakeToUniCurrencyAmount(amount);
        const adjustedQuoteForPancakeswap = quote.mul(
          BigNumber.from(10).pow(quoteToken.decimals)
        ) as BigNumber;
        const routeWithValidQuote = new V2RouteWithValidQuote({
          route,
          rawQuote: adjustedQuoteForPancakeswap,
          amount: uAmount,
          percent,
          gasModel,
          quoteToken,
          tradeType: swapType,
          v2PoolProvider: this.pancakeV2PoolProvider,
          platform: BarterProtocol.PANCAKESWAP,
        });
        routesWithValidQuotes.push(routeWithValidQuote);
      }
    }
    return { routesWithValidQuotes, candidatePools };
  }
  // Note multiplications here can result in a loss of precision in the amounts (e.g. taking 50% of 101)
  // This is reconcilled at the end of the algorithm by adding any lost precision to one of
  // the splits in the route.
  private getAmountDistribution(
    amount: CurrencyAmount,
    routingConfig: AlphaRouterConfig
  ): [number[], CurrencyAmount[]] {
    const { distributionPercent } = routingConfig;
    let percents = [];
    let amounts = [];

    for (let i = 1; i <= 100 / distributionPercent; i++) {
      percents.push(i * distributionPercent);
      amounts.push(amount.multiply(new Fraction(i * distributionPercent, 100)));
    }

    return [percents, amounts];
  }

  // private async buildSwapAndAddMethodParameters(
  //   trade: Trade<Currency, Currency, TradeType>,
  //   swapAndAddOptions: SwapAndAddOptions,
  //   swapAndAddParameters: SwapAndAddParameters
  // ): Promise<MethodParameters> {
  //   const {
  //     swapOptions: { recipient, slippageTolerance, deadline, inputTokenPermit },
  //     addLiquidityOptions: addLiquidityConfig,
  //   } = swapAndAddOptions;

  //   const preLiquidityPosition = swapAndAddParameters.preLiquidityPosition;
  //   const finalBalanceTokenIn =
  //     swapAndAddParameters.initialBalanceTokenIn.subtract(trade.inputAmount);
  //   const finalBalanceTokenOut =
  //     swapAndAddParameters.initialBalanceTokenOut.add(trade.outputAmount);
  //   const approvalTypes = await this.swapRouterProvider.getApprovalType(
  //     finalBalanceTokenIn,
  //     finalBalanceTokenOut
  //   );
  //   const zeroForOne = finalBalanceTokenIn.currency.wrapped.sortsBefore(
  //     finalBalanceTokenOut.currency.wrapped
  //   );
  //   return SwapRouter.swapAndAddCallParameters(
  //     trade,
  //     {
  //       recipient,
  //       slippageTolerance,
  //       deadlineOrPreviousBlockhash: deadline,
  //       inputTokenPermit,
  //     },
  //     Position.fromAmounts({
  //       pool: preLiquidityPosition.pool,
  //       tickLower: preLiquidityPosition.tickLower,
  //       tickUpper: preLiquidityPosition.tickUpper,
  //       amount0: zeroForOne
  //         ? finalBalanceTokenIn.quotient.toString()
  //         : finalBalanceTokenOut.quotient.toString(),
  //       amount1: zeroForOne
  //         ? finalBalanceTokenOut.quotient.toString()
  //         : finalBalanceTokenIn.quotient.toString(),
  //       useFullPrecision: false,
  //     }),
  //     addLiquidityConfig,
  //     approvalTypes.approvalTokenIn,
  //     approvalTypes.approvalTokenOut
  //   );
  // }

  private getBlockNumberPromise(): number | Promise<number> {
    return retry(
      async (_b, attempt) => {
        if (attempt > 1) {
          log.info(`Get block number attempt ${attempt}`);
        }
        return this.provider.getBlockNumber();
      },
      {
        retries: 2,
        minTimeout: 100,
        maxTimeout: 1000,
      }
    );
  }
  private async applyTokenValidatorToPools<T extends Pair>(
    pools: T[],
    isInvalidFn: (
      token: Currency,
      tokenValidation: TokenValidationResult | undefined
    ) => boolean
  ): Promise<T[]> {
    if (!this.tokenValidatorProvider) {
      return pools;
    }

    log.info(`Running token validator on ${pools.length} pools`);

    const tokens = _.flatMap(pools, (pool) => [pool.token0, pool.token1]);

    const tokenValidationResults =
      await this.tokenValidatorProvider.validateTokens(
        pancakeTokensToUniTokens(tokens)
      );

    const poolsFiltered = _.filter(pools, (pool: T) => {
      const token0Validation = tokenValidationResults.getValidationByToken(
        pancakeTokenToUniToken(pool.token0)
      );
      const token1Validation = tokenValidationResults.getValidationByToken(
        pancakeTokenToUniToken(pool.token1)
      );

      const token0Invalid = isInvalidFn(
        pancakeTokenToUniToken(pool.token0),
        token0Validation
      );
      const token1Invalid = isInvalidFn(
        pancakeTokenToUniToken(pool.token1),
        token1Validation
      );

      if (token0Invalid || token1Invalid) {
        log.info(
          `Dropping pool ${poolToString(pool)} because token is invalid. ${
            pool.token0.symbol
          }: ${token0Validation}, ${pool.token1.symbol}: ${token1Validation}`
        );
      }

      return !token0Invalid && !token1Invalid;
    });

    return poolsFiltered;
  }
}
