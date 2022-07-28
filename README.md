# Barter Smart Router
finding the best cross-chain swap route.

# Barter Smart Auto Router Usage
## Function Call
```
getBestRoute(
	chainId: number,					// chainId. e.g. Polygon: 137
	provider: providers.BaseProvider,	// provider
	protocols: BarterProtocol[],		// protocol included
	swapAmountHumanReadable: string,	// swap amount
	tokenInAddress: string,				// tokenInAddress: 
	tokenInDecimal: number,				// tokenInDecimal
	tokenOutAddress: string,			// tokenOutAddress: 
	tokenOutDecimal: number,			// tokenOutDecimal
	tradeType: VTradeType,				// EXACT_IN or EXACT_OUT
	tokenInSymbol?: string,				// optional
	tokenInName?: string,				// optional			
	tokenOutSymbol?: string,			// optional
	tokenOutName?: string				// optional
): Promise<SwapRoute | null>
```

## Parameters
### protocols: BarterProtocol[]
Array of protocol need to considered in swap， see ([here](https://github.com/BarterTeam/barter-smart-router/blob/master/src/util/protocol.ts))
```
export  enum  BarterProtocol {
	UNI_V2 = 'V2',
	UNI_V3 = 'V3',
	QUICKSWAP = 'QUICKSWAP',
	SUSHISWAP = 'SUSHISWAP',
}
```

### tradeType: VTradeType
```
export  enum  TradeType {
	EXACT_INPUT = 0,	// regular direction，tokenIn -> tokenOut
	EXACT_OUTPUT = 1,	// reverse direction, tokenOut -> tokenIn
}
```

## return parameter
### SwapRoutes see([definition](https://github.com/BarterTeam/barter-smart-router/blob/master/src/routers/router.ts#L25))

## Example
### swap 8000000 usdt to usdc on polygon
code: [test-script.ts](https://github.com/BarterTeam/barter-smart-router/blob/master/src/test-scripts/auto-router.ts) <br>
run script: 
```
npm install
npm run build
ts-node --files src/test-scripts/auto-router.ts
``` 
output example:
```
UNISWAP-V3 2800000 = USDT -- 0.05% [0x3F5228d0e7D75467366be7De2c31D0d098bA2C23] --> USDC = 2797757.642167)}
QUICKSWAP 2000000 = USDT -- [0x1659B07B0b4A297e13C01284B36D4494c1A22275] --> WETH -- [0x9806b4FA9821031369AE074d991835F5865d0983] --> USDC = 1611261)}
QUICKSWAP 1200000 = USDT -- [0x6C0c25f7D8Db70Ed9941afeeAF9d716a8aC4749C] --> USDC = 1001295)}<br>
QUICKSWAP 800000 = USDT -- [0xE801a73681Eed2ea8e717a46935DbdCAFf7A0477] --> WMATIC -- [0x6EDadf331a2Bd47Ee5897ee0D58c7d040B0e12Ca] --> USDC = 659907)}<br>
QUICKSWAP 400000 = USDT -- [0x9E44da0F02Ce19259C831B8ae497740aac7348C6] --> miMATIC -- [0x09170725120529Fef5Bcac8F318fF5C35C90EF28] --> USDC = 303109)}<br>
SUSHISWAP 400000 = USDT -- [0x1659B07B0b4A297e13C01284B36D4494c1A22275] --> WETH -- [0x9806b4FA9821031369AE074d991835F5865d0983] --> USDC = 309121.43669)}<br>
SUSHISWAP 400000 = USDT -- [0x6C0c25f7D8Db70Ed9941afeeAF9d716a8aC4749C] --> USDC = 316994.345732)}<br>
total get:  6999445.378879
```
