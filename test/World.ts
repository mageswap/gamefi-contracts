import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {EstforConstants, EstforTypes} from "@paintswap/estfor-definitions";
import {SHADOW_SCROLL} from "@paintswap/estfor-definitions/constants";
import {ActionInput} from "@paintswap/estfor-definitions/types";
import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {getActionId, RATE_MUL, SPAWN_MUL} from "./utils";

describe("World", function () {
  const deployContracts = async function () {
    // Contracts are deployed using the first signer/account by default
    const [owner, alice] = await ethers.getSigners();

    const MockOracleClient = await ethers.getContractFactory("MockOracleClient");
    const mockOracleClient = await MockOracleClient.deploy();

    // Add some dummy blocks so that world can access them
    for (let i = 0; i < 5; ++i) {
      await owner.sendTransaction({
        to: owner.address,
        value: 1,
      });
    }

    // Create the world
    const WorldLibrary = await ethers.getContractFactory("WorldLibrary");
    const worldLibrary = await WorldLibrary.deploy();
    const subscriptionId = 2;
    const World = await ethers.getContractFactory("World", {libraries: {WorldLibrary: worldLibrary.address}});
    const world = await upgrades.deployProxy(World, [mockOracleClient.address, subscriptionId], {
      kind: "uups",
      unsafeAllow: ["delegatecall", "external-library-linking"],
    });

    const minRandomWordsUpdateTime = await world.MIN_RANDOM_WORDS_UPDATE_TIME();

    return {
      world,
      worldLibrary,
      mockOracleClient,
      minRandomWordsUpdateTime,
      owner,
      alice,
    };
  };

  describe("Seed", function () {
    it("Requesting random words", async function () {
      const {world, mockOracleClient, minRandomWordsUpdateTime} = await loadFixture(deployContracts);
      await world.requestRandomWords();

      const startOffset = 4;
      let requestId = await world.requestIds(startOffset);
      expect(requestId).to.be.greaterThanOrEqual(1);

      let randomWord = await world.randomWords(requestId, 0);
      expect(randomWord).to.eq(0);

      // Retrieve the random number
      await mockOracleClient.fulfill(requestId, world.address);
      randomWord = await world.randomWords(requestId, 0);
      expect(randomWord).to.not.eq(0);

      // Try fulfill same request should fail
      await expect(mockOracleClient.fulfill(requestId, world.address)).to.be.reverted;

      // Requesting new random word too soon
      await expect(world.requestRandomWords()).to.be.reverted;

      // Increase time and check it works
      await ethers.provider.send("evm_increaseTime", [minRandomWordsUpdateTime]);
      await world.requestRandomWords();
      requestId = await world.requestIds(startOffset + 1);
      await mockOracleClient.fulfill(requestId, world.address);

      // Increase it 2x more, should allow 2 random seeds to be requested
      await ethers.provider.send("evm_increaseTime", [minRandomWordsUpdateTime * 2]);
      await world.requestRandomWords();
      requestId = await world.requestIds(startOffset + 2);
      await mockOracleClient.fulfill(requestId, world.address);
      await world.requestRandomWords();
      requestId = await world.requestIds(startOffset + 3);
      await mockOracleClient.fulfill(requestId, world.address);
      await expect(world.requestRandomWords()).to.be.reverted;
      await expect(world.requestIds(startOffset + 4)).to.be.reverted;
    });

    it("getRandomWord", async function () {
      const {world, mockOracleClient, minRandomWordsUpdateTime} = await loadFixture(deployContracts);
      const {timestamp: currentTimestamp} = await ethers.provider.getBlock("latest");
      expect(await world.hasRandomWord(currentTimestamp)).to.be.false;
      await ethers.provider.send("evm_increaseTime", [minRandomWordsUpdateTime]);
      await world.requestRandomWords();
      await expect(world.requestIds(5)).to.be.reverted;
      let requestId = await world.requestIds(4);
      await mockOracleClient.fulfill(requestId, world.address);
      expect(await world.hasRandomWord(currentTimestamp)).to.be.false;
      await world.requestRandomWords();
      requestId = await world.requestIds(5);
      await mockOracleClient.fulfill(requestId, world.address);
      expect(await world.hasRandomWord(currentTimestamp)).to.be.true;
      await expect(world.getRandomWord(currentTimestamp)).to.not.be.reverted;
      // Gives unhandled project rejection for some reason
      // Before 5 day offset
      await expect(world.getRandomWord(currentTimestamp - minRandomWordsUpdateTime * 6)).to.be.revertedWithCustomError(
        world,
        "NoValidRandomWord"
      );
      // After offset
      await expect(world.getRandomWord(currentTimestamp + minRandomWordsUpdateTime)).to.be.revertedWithCustomError(
        world,
        "NoValidRandomWord"
      );
    });

    it("Get full/multiple words", async function () {
      const {world, mockOracleClient, minRandomWordsUpdateTime} = await loadFixture(deployContracts);
      const {timestamp: currentTimestamp} = await ethers.provider.getBlock("latest");
      await expect(world.getFullRandomWords(currentTimestamp)).to.be.revertedWithCustomError(
        world,
        "NoValidRandomWord"
      );
      await expect(world.getMultipleFullRandomWords(currentTimestamp)).to.be.revertedWithCustomError(
        world,
        "NoValidRandomWord"
      );
      await ethers.provider.send("evm_increaseTime", [minRandomWordsUpdateTime]);
      await world.requestRandomWords();
      let requestId = await world.requestIds(4);
      await mockOracleClient.fulfill(requestId, world.address);
      await expect(world.getFullRandomWords(currentTimestamp)).to.be.revertedWithCustomError(
        world,
        "NoValidRandomWord"
      );
      await expect(world.getMultipleFullRandomWords(currentTimestamp)).to.be.revertedWithCustomError(
        world,
        "NoValidRandomWord"
      );
      await world.requestRandomWords();
      requestId = await world.requestIds(5);
      await mockOracleClient.fulfill(requestId, world.address);

      const fullWords = await world.getFullRandomWords(currentTimestamp);
      const multipleWords = await world.getMultipleFullRandomWords(currentTimestamp);
      expect(fullWords).to.eql(multipleWords[0]);
      expect(multipleWords.length).to.eq(5);
      for (let i = 0; i < 5; ++i) {
        expect(multipleWords[i][0]).to.not.eq(0);
        expect(multipleWords[i][1]).to.not.eq(0);
        expect(multipleWords[i][2]).to.not.eq(0);
      }
    });
  });

  describe("Actions", function () {
    it("Add/Edit/Delete normal", async function () {
      const {world} = await loadFixture(deployContracts);
      const actionAvailable = false;
      let tx = await world.addAction({
        actionId: 1,
        info: {
          skill: EstforTypes.Skill.COMBAT,
          xpPerHour: 3600,
          minXP: 0,
          isDynamic: false,
          numSpawned: 1 * SPAWN_MUL,
          handItemTokenIdRangeMin: EstforConstants.COMBAT_BASE,
          handItemTokenIdRangeMax: EstforConstants.COMBAT_MAX,
          isAvailable: actionAvailable,
          actionChoiceRequired: true,
          successPercent: 100,
        },
        guaranteedRewards: [],
        randomRewards: [],
        combatStats: EstforTypes.emptyCombatStats,
      });
      const actionId = await getActionId(tx);
      expect((await world.actions(actionId)).skill).to.eq(EstforTypes.Skill.COMBAT);
      await world.editActions([
        {
          actionId,
          info: {
            skill: EstforTypes.Skill.COMBAT,
            xpPerHour: 20,
            minXP: 0,
            isDynamic: false,
            numSpawned: 1 * SPAWN_MUL,
            handItemTokenIdRangeMin: EstforConstants.COMBAT_BASE,
            handItemTokenIdRangeMax: EstforConstants.COMBAT_MAX,
            isAvailable: actionAvailable,
            actionChoiceRequired: true,
            successPercent: 100,
          },
          guaranteedRewards: [],
          randomRewards: [],
          combatStats: EstforTypes.emptyCombatStats,
        },
      ]);
      expect((await world.actions(actionId)).xpPerHour).to.eq(20);
      expect((await world.actions(actionId)).isAvailable).to.be.false;
      await world.setAvailable(actionId, true);
      expect((await world.actions(actionId)).isAvailable).to.be.true;
      await world.setAvailable(actionId, false);
      expect((await world.actions(actionId)).isAvailable).to.be.false;

      // Set available on an action that is dynamic (this should be random only)
      await world.editActions([
        {
          actionId,
          info: {
            skill: EstforTypes.Skill.COMBAT,
            xpPerHour: 3600,
            minXP: 0,
            isDynamic: true,
            numSpawned: 1 * SPAWN_MUL,
            handItemTokenIdRangeMin: EstforConstants.COMBAT_BASE,
            handItemTokenIdRangeMax: EstforConstants.COMBAT_MAX,
            isAvailable: actionAvailable,
            actionChoiceRequired: true,
            successPercent: 100,
          },
          guaranteedRewards: [],
          randomRewards: [],
          combatStats: EstforTypes.emptyCombatStats,
        },
      ]);
      await expect(world.setAvailable(actionId, false)).to.be.reverted;
    });

    it("Dynamic actions", async function () {
      // Dynamic actions TODO
    });
  });

  describe("ActionChoices", function () {
    it("Cannot use id 0", async function () {
      const {world} = await loadFixture(deployContracts);
      const choiceId = 0;
      await expect(
        world.addActionChoice(EstforConstants.NONE, choiceId, {
          skill: EstforTypes.Skill.MAGIC,
          skillDiff: 2,
          xpPerHour: 0,
          minXP: 0,
          rate: 1 * RATE_MUL,
          inputTokenId1: EstforConstants.AIR_SCROLL,
          inputAmount1: 1,
          inputTokenId2: EstforConstants.NONE,
          inputAmount2: 0,
          inputTokenId3: EstforConstants.NONE,
          inputAmount3: 0,
          outputTokenId: EstforConstants.NONE,
          outputAmount: 0,
          successPercent: 100,
        })
      ).to.be.reverted;
    });
  });

  describe("ActionRewards", function () {
    it("Guaranteed reward order", async function () {
      const {world, worldLibrary} = await loadFixture(deployContracts);
      const actionAvailable = false;
      const action: ActionInput = {
        actionId: 1,
        info: {
          skill: EstforTypes.Skill.COMBAT,
          xpPerHour: 3600,
          minXP: 0,
          isDynamic: false,
          numSpawned: 1 * SPAWN_MUL,
          handItemTokenIdRangeMin: EstforConstants.COMBAT_BASE,
          handItemTokenIdRangeMax: EstforConstants.COMBAT_MAX,
          isAvailable: actionAvailable,
          actionChoiceRequired: true,
          successPercent: 100,
        },
        guaranteedRewards: [
          {itemTokenId: EstforConstants.SHADOW_SCROLL, rate: 300},
          {itemTokenId: EstforConstants.AIR_SCROLL, rate: 200},
          {itemTokenId: EstforConstants.HELL_SCROLL, rate: 100},
        ],
        randomRewards: [],
        combatStats: EstforTypes.emptyCombatStats,
      };

      await expect(world.addAction(action)).to.be.revertedWithCustomError(
        worldLibrary,
        "GuaranteedRewardsMustBeInOrder"
      );
      action.guaranteedRewards[0].rate = 50;
      await expect(world.addAction(action)).to.be.revertedWithCustomError(
        worldLibrary,
        "GuaranteedRewardsMustBeInOrder"
      );
      action.guaranteedRewards[1].rate = 150;
      await expect(world.addAction(action)).to.be.revertedWithCustomError(
        worldLibrary,
        "GuaranteedRewardsMustBeInOrder"
      );
      action.guaranteedRewards[2].rate = 150;
      await expect(world.addAction(action)).to.not.be.reverted;
    });

    it("Guaranteed reward duplicates not allowed", async function () {
      const {world, worldLibrary} = await loadFixture(deployContracts);
      const actionAvailable = false;
      const action: ActionInput = {
        actionId: 1,
        info: {
          skill: EstforTypes.Skill.COMBAT,
          xpPerHour: 3600,
          minXP: 0,
          isDynamic: false,
          numSpawned: 1 * SPAWN_MUL,
          handItemTokenIdRangeMin: EstforConstants.COMBAT_BASE,
          handItemTokenIdRangeMax: EstforConstants.COMBAT_MAX,
          isAvailable: actionAvailable,
          actionChoiceRequired: true,
          successPercent: 100,
        },
        guaranteedRewards: [
          {itemTokenId: EstforConstants.AIR_SCROLL, rate: 100},
          {itemTokenId: EstforConstants.AIR_SCROLL, rate: 200},
        ],
        randomRewards: [],
        combatStats: EstforTypes.emptyCombatStats,
      };

      await expect(world.addAction(action)).to.be.revertedWithCustomError(
        worldLibrary,
        "GuaranteedRewardsNoDuplicates"
      );
      action.guaranteedRewards[0].itemTokenId = SHADOW_SCROLL;
      await expect(world.addAction(action)).to.not.be.reverted;
    });

    it("Only multiple guaranteed rewards allowed for combat", async function () {
      const {world} = await loadFixture(deployContracts);
      const actionAvailable = false;
      const action: ActionInput = {
        actionId: 1,
        info: {
          skill: EstforTypes.Skill.COOKING,
          xpPerHour: 3600,
          minXP: 0,
          isDynamic: false,
          numSpawned: 1 * SPAWN_MUL,
          handItemTokenIdRangeMin: EstforConstants.NONE,
          handItemTokenIdRangeMax: EstforConstants.NONE,
          isAvailable: actionAvailable,
          actionChoiceRequired: true,
          successPercent: 100,
        },
        guaranteedRewards: [
          {itemTokenId: EstforConstants.AIR_SCROLL, rate: 100},
          {itemTokenId: EstforConstants.SHADOW_SCROLL, rate: 200},
        ],
        randomRewards: [],
        combatStats: EstforTypes.emptyCombatStats,
      };

      await expect(world.addAction(action)).to.be.revertedWithCustomError(world, "OnlyCombatMultipleGuaranteedRewards");

      action.info.skill = EstforTypes.Skill.COMBAT;
      await expect(world.addAction(action)).to.not.be.reverted;
    });

    it("Random reward order", async function () {
      const {world, worldLibrary} = await loadFixture(deployContracts);
      const actionAvailable = false;
      const action: ActionInput = {
        actionId: 1,
        info: {
          skill: EstforTypes.Skill.COMBAT,
          xpPerHour: 3600,
          minXP: 0,
          isDynamic: false,
          numSpawned: 1 * SPAWN_MUL,
          handItemTokenIdRangeMin: EstforConstants.COMBAT_BASE,
          handItemTokenIdRangeMax: EstforConstants.COMBAT_MAX,
          isAvailable: actionAvailable,
          actionChoiceRequired: true,
          successPercent: 100,
        },
        guaranteedRewards: [],
        randomRewards: [
          {itemTokenId: EstforConstants.SHADOW_SCROLL, chance: 30, amount: 1},
          {itemTokenId: EstforConstants.AIR_SCROLL, chance: 50, amount: 1},
          {itemTokenId: EstforConstants.AQUA_SCROLL, chance: 100, amount: 1},
          {itemTokenId: EstforConstants.HELL_SCROLL, chance: 200, amount: 1},
        ],
        combatStats: EstforTypes.emptyCombatStats,
      };

      await expect(world.addAction(action)).to.be.revertedWithCustomError(worldLibrary, "RandomRewardsMustBeInOrder");
      action.randomRewards[0].chance = 300;
      await expect(world.addAction(action)).to.be.revertedWithCustomError(worldLibrary, "RandomRewardsMustBeInOrder");
      action.randomRewards[1].chance = 250;
      await expect(world.addAction(action)).to.be.revertedWithCustomError(worldLibrary, "RandomRewardsMustBeInOrder");
      action.randomRewards[2].chance = 225;
      await expect(world.addAction(action)).to.not.be.reverted;
    });

    it("Random reward duplicate not allowed", async function () {
      const {world, worldLibrary} = await loadFixture(deployContracts);
      const actionAvailable = false;
      const action: ActionInput = {
        actionId: 1,
        info: {
          skill: EstforTypes.Skill.COMBAT,
          xpPerHour: 3600,
          minXP: 0,
          isDynamic: false,
          numSpawned: 1 * SPAWN_MUL,
          handItemTokenIdRangeMin: EstforConstants.COMBAT_BASE,
          handItemTokenIdRangeMax: EstforConstants.COMBAT_MAX,
          isAvailable: actionAvailable,
          actionChoiceRequired: true,
          successPercent: 100,
        },
        guaranteedRewards: [],
        randomRewards: [
          {itemTokenId: EstforConstants.AIR_SCROLL, chance: 200, amount: 1},
          {itemTokenId: EstforConstants.AIR_SCROLL, chance: 100, amount: 1},
        ],
        combatStats: EstforTypes.emptyCombatStats,
      };

      await expect(world.addAction(action)).to.be.revertedWithCustomError(worldLibrary, "RandomRewardNoDuplicates");
      action.randomRewards[0].itemTokenId = SHADOW_SCROLL;
      await expect(world.addAction(action)).to.not.be.reverted;
    });

    it("Only combat can have both guaranteed and random rewards", async function () {
      const {world} = await loadFixture(deployContracts);
      const actionAvailable = false;
      const action: ActionInput = {
        actionId: 1,
        info: {
          skill: EstforTypes.Skill.COOKING,
          xpPerHour: 3600,
          minXP: 0,
          isDynamic: false,
          numSpawned: 1 * SPAWN_MUL,
          handItemTokenIdRangeMin: EstforConstants.COMBAT_BASE,
          handItemTokenIdRangeMax: EstforConstants.COMBAT_MAX,
          isAvailable: actionAvailable,
          actionChoiceRequired: true,
          successPercent: 100,
        },
        guaranteedRewards: [{itemTokenId: EstforConstants.AIR_SCROLL, rate: 100}],
        randomRewards: [{itemTokenId: EstforConstants.AIR_SCROLL, chance: 100, amount: 1}],
        combatStats: EstforTypes.emptyCombatStats,
      };

      await expect(world.addAction(action)).to.be.revertedWithCustomError(
        world,
        "NonCombatCannotHaveBothGuaranteedAndRandomRewards"
      );
      action.info.skill = EstforTypes.Skill.COMBAT;
      await expect(world.addAction(action)).to.not.be.reverted;
    });
  });
});
