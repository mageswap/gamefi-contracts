import {EstforConstants, EstforTypes} from "@paintswap/estfor-definitions";
import {ActionChoiceInput, PendingFlags} from "@paintswap/estfor-definitions/types";
import {ContractTransaction} from "ethers";

export const getRequestId = async (tx: ContractTransaction): Promise<number> => {
  const receipt = await tx.wait();
  const event = receipt?.events?.filter((x) => {
    return x.event == "RequestSent";
  })[0].args;
  return event?.requestId.toNumber();
};

export const getActionId = async (tx: ContractTransaction): Promise<number> => {
  const receipt = await tx.wait();
  const event = receipt?.events?.filter((x) => {
    return x.event == "AddAction";
  })[0].args;
  return event?.action.actionId;
};

export const getActionChoiceId = async (tx: ContractTransaction): Promise<number> => {
  const receipt = await tx.wait();
  const event = receipt?.events?.filter((x) => {
    return x.event == "AddActionChoice";
  })[0].args;
  return event?.actionChoiceId;
};

export const getActionChoiceIds = async (tx: ContractTransaction): Promise<number[]> => {
  const receipt = await tx.wait();
  const event = receipt?.events?.filter((x) => {
    return x.event == "AddActionChoices";
  })[0].args;
  return event?.actionChoiceIds;
};

export const bronzeHelmetStats: EstforTypes.CombatStats = {
  melee: 1,
  magic: 0,
  range: 0,
  meleeDefence: 4,
  magicDefence: 0,
  rangeDefence: 1,
  health: 1,
};

export const emptyActionChoice: ActionChoiceInput = {
  skill: EstforTypes.Skill.NONE,
  diff: 0,
  rate: 0,
  xpPerHour: 0,
  minXP: 0,
  inputTokenId1: EstforConstants.NONE,
  inputAmount1: 0,
  inputTokenId2: EstforConstants.NONE,
  inputAmount2: 0,
  inputTokenId3: EstforConstants.NONE,
  inputAmount3: 0,
  outputTokenId: EstforConstants.NONE,
  outputAmount: 0,
  successPercent: 100,
};

// Should match the PlayersBase contract constants
export const MAX_TIME = 86400; // 1 day
export const START_XP = 374;
// 90%, used for actions/actionChoices which can have a failure rate like thieving/cooking
export const MAX_SUCCESS_PERCENT_CHANCE = 90;
export const MAX_UNIQUE_TICKETS = 240;
