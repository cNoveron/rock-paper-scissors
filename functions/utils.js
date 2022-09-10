const { BigNumber } = require('ethers')

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

mineBlock = (provider, timestamp) => {
    return provider.send('evm_mine', [timestamp.toNumber()-1])
}

fastFoward = async (provider, time) => 
    await mineBlock(
        provider, 
        typeof time === 'number' 
            ? BigNumber.from(time) 
            : time
    )

getLatestBlock = async (provider) => 
    provider.send('eth_getBlockByNumber', ['latest', true])

getLatestTimestamp = async (provider) => 
    parseInt((await getLatestBlock(provider)).timestamp.toString())

advanceTimePeriods = async (provider, periods, period) =>
    await getLatestTimestamp(provider)
        .then((timestamp) => timestamp + periods * period)
        .then((timestamp) => fastFoward(provider, timestamp))
  
advanceMinutes = async (provider, periods) => 
    await advanceTimePeriods(provider, periods, MINUTE)

advanceHours = async (provider, periods) => 
    await advanceTimePeriods(provider, periods, HOUR)

advanceDays = async (provider, periods)  => 
    await advanceTimePeriods(provider, periods, DAY)

advanceWeeks = async (provider, periods) => 
    await advanceTimePeriods(provider, periods, WEEK)

toAtomicUnits = (n) => BigNumber.from(n).mul(BigNumber.from(10).pow(18))
    
module.exports = {
    HOUR,
    DAY,
    mineBlock,
    fastFoward,
    getLatestTimestamp,
    advanceMinutes,
    advanceHours,
    advanceDays,
    advanceWeeks,
    toAtomicUnits
}