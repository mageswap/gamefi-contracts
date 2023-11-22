import {EstforConstants} from "@paintswap/estfor-definitions";
import {ethers} from "hardhat";
import {PROMOTIONS_ADDRESS} from "./contractAddresses";
import {Promotions} from "../typechain-types";
import {Promotion} from "@paintswap/estfor-definitions/types";

async function main() {
  const [owner] = await ethers.getSigners();
  console.log(`Add a promotion using account: ${owner.address} on chain id: ${await owner.getChainId()}`);
  const promotions = (await ethers.getContractAt("Promotions", PROMOTIONS_ADDRESS)) as Promotions;

  /*
  await promotions.addPromotion({
    promotion: Promotion.HALLOWEEN_2023,
    startTime: 1698701204, // Any time from now
    endTime: 1698825600, // Expires 8am UTC on Nov 1st
    minTotalXP: 6000,
    numItemsToPick: 1,
    isRandom: true,
    isMultiday: false,
    numDaysClaimablePeriodStreakBonus: 0,
    numDaysHitNeededForStreakBonus: 0,
    isStreakBonusRandom: false,
    numStreakBonusItemsToPick: 0,
    streakBonusItemTokenIds: [],
    streakBonusAmounts: [],
    itemTokenIds: [
      EstforConstants.HALLOWEEN_BONUS_1,
      EstforConstants.HALLOWEEN_BONUS_2,
      EstforConstants.HALLOWEEN_BONUS_3,
    ],
    amounts: [1, 1, 1],
  }); */

  // Temporary XMAS promotion
  const startTime = 1700563660; // tues nov 21st 10:47 UTC
  const numDays = 2;
  await promotions.addPromotion({
    promotion: Promotion.XMAS_2023,
    startTime,
    endTime: startTime + 24 * 3600 * numDays,
    minTotalXP: 0,
    numDailyRandomItemsToPick: 1,
    isMultiday: true,
    brushCostMissedDay: "0",
    brushCost: "0",
    redeemCodeLength: 0,
    adminOnly: false,
    promotionTiedToUser: false,
    promotionTiedToPlayer: false,
    promotionMustOwnPlayer: false,
    evolvedHeroOnly: false,
    numDaysClaimablePeriodStreakBonus: 1,
    numDaysHitNeededForStreakBonus: 1,
    numRandomStreakBonusItemsToPick1: 1,
    numRandomStreakBonusItemsToPick2: 0,
    randomStreakBonusItemTokenIds1: [
      EstforConstants.HALLOWEEN_BONUS_1,
      EstforConstants.HALLOWEEN_BONUS_2,
      EstforConstants.HALLOWEEN_BONUS_3,
    ],
    randomStreakBonusAmounts1: [1, 1, 1],
    randomStreakBonusAmounts2: [],
    randomStreakBonusItemTokenIds2: [],
    guaranteedStreakBonusItemTokenIds: [],
    guaranteedStreakBonusAmounts: [],
    guaranteedItemTokenIds: [],
    guaranteedAmounts: [],
    randomItemTokenIds: [],
    randomAmounts: [],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
