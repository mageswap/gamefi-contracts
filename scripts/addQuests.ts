import {ethers} from "hardhat";
import {QUESTS_ADDRESS} from "./contractAddresses";
import {MinRequirementArray, QuestInput, allQuests, allQuestsMinRequirements} from "./data/quests";
import {EstforConstants} from "@paintswap/estfor-definitions";
import {Quests} from "../typechain-types";

async function main() {
  const [owner] = await ethers.getSigners();
  console.log(`Add quests using account: ${owner.address} on chain id ${await owner.getChainId()}`);

  const quests = (await ethers.getContractAt("Quests", QUESTS_ADDRESS)) as Quests;
  const questIndexes = allQuests
    .map((q, index) => (q.questId === EstforConstants.QUEST_DRAGON_SLAYER ? index : ""))
    .filter(String) as number[];
  if (questIndexes.length != 1) {
    console.error("Could not find these quests");
    return;
  }

  const newQuests: QuestInput[] = questIndexes.map((index) => allQuests[index]);
  const minRequirements: MinRequirementArray[] = questIndexes.map((index) => allQuestsMinRequirements[index]);
  await quests.addQuests(newQuests, minRequirements);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
