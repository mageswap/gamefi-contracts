// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./PlayersImplBase.sol";

import {PlayerLibrary} from "./PlayerLibrary.sol";

contract PlayersImplRewards is PlayersUpgradeableImplDummyBase, PlayersBase {
  constructor() {
    _checkStartSlot();
  }

  function getRewards(
    uint40 _skillEndTime,
    uint _elapsedTime,
    uint16 _actionId
  ) public view returns (uint[] memory ids, uint[] memory amounts) {
    ActionRewards memory actionRewards = world.getActionRewards(_actionId);
    bool isCombat = world.getSkill(_actionId) == Skill.COMBAT;

    ids = new uint[](MAX_REWARDS_PER_ACTION);
    amounts = new uint[](MAX_REWARDS_PER_ACTION);

    uint numSpawnedPerHour = world.getNumSpawn(_actionId);
    uint16 monstersKilled = uint16((numSpawnedPerHour * _elapsedTime) / 3600);

    uint length = _appendGuaranteedRewards(ids, amounts, _elapsedTime, actionRewards, monstersKilled, isCombat);
    bool noLuck;
    (length, noLuck) = _appendRandomRewards(
      _skillEndTime,
      _elapsedTime,
      ids,
      amounts,
      length,
      actionRewards,
      monstersKilled,
      isCombat
    );

    assembly ("memory-safe") {
      mstore(ids, length)
      mstore(amounts, length)
    }
  }

  function _claimableRandomRewards(
    uint _playerId
  ) private view returns (uint[] memory ids, uint[] memory amounts, uint numRemoved) {
    PendingRandomReward[] storage _pendingRandomRewards = pendingRandomRewards[_playerId];
    ids = new uint[](_pendingRandomRewards.length);
    amounts = new uint[](_pendingRandomRewards.length);

    uint length;
    for (uint i; i < _pendingRandomRewards.length; ++i) {
      bool isCombat = world.getSkill(_pendingRandomRewards[i].actionId) == Skill.COMBAT;
      uint numSpawnedPerHour = world.getNumSpawn(_pendingRandomRewards[i].actionId);
      uint16 monstersKilled = uint16((numSpawnedPerHour * _pendingRandomRewards[i].elapsedTime) / 3600);

      ActionRewards memory actionRewards = world.getActionRewards(_pendingRandomRewards[i].actionId);
      uint oldLength = length;
      bool noLuck;
      (length, noLuck) = _appendRandomRewards(
        _pendingRandomRewards[i].timestamp,
        _pendingRandomRewards[i].elapsedTime,
        ids,
        amounts,
        oldLength,
        actionRewards,
        monstersKilled,
        isCombat
      );

      if (length - oldLength > 0 || noLuck) {
        ++numRemoved;
      }
    }

    assembly ("memory-safe") {
      mstore(ids, length)
      mstore(amounts, length)
    }
  }

  function claimRandomRewards(uint _playerId) public isOwnerOfPlayerAndActive(_playerId) {
    address from = msg.sender;
    (uint[] memory ids, uint[] memory amounts, uint numRemoved) = _claimableRandomRewards(_playerId);

    if (numRemoved > 0) {
      // Shift the remaining rewards to the front of the array
      for (uint i; i < pendingRandomRewards[_playerId].length - numRemoved; ++i) {
        pendingRandomRewards[_playerId][i] = pendingRandomRewards[_playerId][i + numRemoved];
      }

      for (uint i; i < numRemoved; ++i) {
        pendingRandomRewards[_playerId].pop();
      }

      itemNFT.mintBatch(from, ids, amounts);
      //      emit Rewards(from, _playerId, _queueId, ids, amounts);
    }
  }

  function claimableXPThresholdRewards(
    uint _oldTotalSkillPoints,
    uint _newTotalSkillPoints
  ) public view returns (uint[] memory itemTokenIds, uint[] memory amounts) {
    uint16 prevIndex = _findBaseXPThreshold(_oldTotalSkillPoints);
    uint16 nextIndex = _findBaseXPThreshold(_newTotalSkillPoints);
    if (prevIndex != nextIndex) {
      uint32 xpThreshold = _getXPReward(nextIndex);
      Equipment[] memory items = xpRewardThresholds[xpThreshold];
      if (items.length > 0) {
        itemTokenIds = new uint[](items.length);
        amounts = new uint[](items.length);
        for (uint i = 0; i < items.length; ++i) {
          itemTokenIds[i] = items[i].itemTokenId;
          amounts[i] = items[i].amount;
        }
      }
    }
  }

  // Get any changes that are pending and not on the blockchain yet.
  function pendingRewards(
    address _owner,
    uint _playerId,
    PendingFlags memory _flags
  ) external view returns (PendingOutput memory pendingOutput) {
    Player storage player = players[_playerId];
    QueuedAction[] storage actionQueue = player.actionQueue;
    uint _speedMultiplier = speedMultiplier[_playerId];
    PendingRandomReward[] storage _pendingRandomRewards = pendingRandomRewards[_playerId];

    pendingOutput.consumed = new Equipment[](actionQueue.length * MAX_CONSUMED_PER_ACTION);
    pendingOutput.produced = new Equipment[](
      actionQueue.length * MAX_REWARDS_PER_ACTION + (_pendingRandomRewards.length * MAX_RANDOM_REWARDS_PER_ACTION)
    );
    pendingOutput.producedPastRandomRewards = new Equipment[](20);
    pendingOutput.producedXPRewards = new Equipment[](20);

    uint consumedLength;
    uint producedLength;
    uint producedPastRandomRewardsLength;
    uint producedXPRewardsLength;
    address from = _owner;
    uint previousSkillPoints = player.totalSkillPoints;
    uint32 allPointsAccrued;
    for (uint i; i < actionQueue.length; ++i) {
      QueuedAction storage queuedAction = actionQueue[i];
      CombatStats memory combatStats;
      bool isCombat = _isCombatStyle(queuedAction.combatStyle);
      if (isCombat) {
        // This will only ones that they have a balance for at this time. This will check balances
        combatStats = _getCachedCombatStats(player);
        _updateCombatStats(from, combatStats, queuedAction.attire);
      }
      bool missingRequiredHandEquipment = _updateStatsFromHandEquipment(
        from,
        [queuedAction.rightHandEquipmentTokenId, queuedAction.leftHandEquipmentTokenId],
        combatStats,
        isCombat
      );
      if (missingRequiredHandEquipment) {
        continue;
      }

      uint32 pointsAccrued;
      uint skillEndTime = queuedAction.startTime +
        (_speedMultiplier > 1 ? uint(queuedAction.timespan) / _speedMultiplier : queuedAction.timespan);

      uint elapsedTime = _getElapsedTime(_playerId, skillEndTime, queuedAction);
      if (elapsedTime == 0) {
        break;
      }

      // Create some items if necessary (smithing ores to bars for instance)
      bool died;

      ActionChoice memory actionChoice;
      uint xpElapsedTime = elapsedTime;
      if (queuedAction.choiceId != 0) {
        actionChoice = world.getActionChoice(isCombat ? 0 : queuedAction.actionId, queuedAction.choiceId);

        Equipment[] memory consumedEquipment;
        Equipment memory output;

        (consumedEquipment, output, xpElapsedTime, died) = _processConsumablesView(
          from,
          queuedAction,
          elapsedTime,
          combatStats,
          actionChoice
        );

        if (output.itemTokenId != NONE) {
          pendingOutput.produced[producedLength++] = output;
        }

        for (uint j; j < consumedEquipment.length; ++j) {
          pendingOutput.consumed[consumedLength++] = consumedEquipment[j];
        }

        pendingOutput.died = died;
      }

      if (!died) {
        Skill skill = world.getSkill(queuedAction.actionId);
        pointsAccrued = _getPointsAccrued(from, _playerId, queuedAction, skill, xpElapsedTime);
      }

      if (_flags.includeLoot && pointsAccrued > 0) {
        (uint[] memory newIds, uint[] memory newAmounts) = getRewards(
          uint40(queuedAction.startTime + xpElapsedTime),
          xpElapsedTime,
          queuedAction.actionId
        );

        for (uint j; j < newIds.length; ++j) {
          pendingOutput.produced[producedLength++] = Equipment(uint16(newIds[j]), uint24(newAmounts[j]));
        }

        // This loot might be needed for a future task so mint now rather than later
        // But this could be improved
        allPointsAccrued += pointsAccrued;
      }
    } // end of loop

    if (_flags.includeXPRewards && allPointsAccrued > 0) {
      (uint[] memory ids, uint[] memory amounts) = claimableXPThresholdRewards(
        previousSkillPoints,
        previousSkillPoints + allPointsAccrued
      );

      for (uint i; i < ids.length; ++i) {
        pendingOutput.producedXPRewards[producedXPRewardsLength++] = Equipment(uint16(ids[i]), uint24(amounts[i]));
      }
    }

    if (_flags.includePastRandomRewards) {
      // Loop through any pending random rewards and add them to the output
      (uint[] memory ids, uint[] memory amounts, uint numRemoved) = _claimableRandomRewards(_playerId);

      for (uint i; i < ids.length; ++i) {
        pendingOutput.producedPastRandomRewards[producedPastRandomRewardsLength++] = Equipment(
          uint16(ids[i]),
          uint24(amounts[i])
        );
      }
    }

    // Compact to fit the arrays
    assembly ("memory-safe") {
      mstore(mload(pendingOutput), consumedLength)
      mstore(mload(add(pendingOutput, 32)), producedLength)
      mstore(mload(add(pendingOutput, 64)), producedPastRandomRewardsLength)
      mstore(mload(add(pendingOutput, 96)), producedXPRewardsLength)
    }
  }

  function _appendGuaranteedReward(
    uint[] memory _ids,
    uint[] memory _amounts,
    uint _elapsedTime,
    uint16 _rewardTokenId,
    uint24 _rewardRate,
    uint _oldLength,
    uint16 _monstersKilled,
    bool _isCombat
  ) private pure returns (uint length) {
    length = _oldLength;

    uint numRewards;
    if (_isCombat) {
      numRewards = _monstersKilled;
    } else {
      numRewards = (_elapsedTime * _rewardRate) / (3600 * 100);
    }

    if (numRewards > 0) {
      _ids[length] = _rewardTokenId;
      _amounts[length] = numRewards;
      ++length;
    }
  }

  function _appendGuaranteedRewards(
    uint[] memory _ids,
    uint[] memory _amounts,
    uint _elapsedTime,
    ActionRewards memory _actionRewards,
    uint16 _monstersKilled,
    bool _isCombat
  ) private pure returns (uint length) {
    length = _appendGuaranteedReward(
      _ids,
      _amounts,
      _elapsedTime,
      _actionRewards.guaranteedRewardTokenId1,
      _actionRewards.guaranteedRewardRate1,
      length,
      _monstersKilled,
      _isCombat
    );
    length = _appendGuaranteedReward(
      _ids,
      _amounts,
      _elapsedTime,
      _actionRewards.guaranteedRewardTokenId2,
      _actionRewards.guaranteedRewardRate3,
      length,
      _monstersKilled,
      _isCombat
    );
    length = _appendGuaranteedReward(
      _ids,
      _amounts,
      _elapsedTime,
      _actionRewards.guaranteedRewardTokenId3,
      _actionRewards.guaranteedRewardRate2,
      length,
      _monstersKilled,
      _isCombat
    );
  }

  function _appendRandomRewards(
    uint40 skillEndTime,
    uint elapsedTime,
    uint[] memory _ids,
    uint[] memory _amounts,
    uint _oldLength,
    ActionRewards memory _actionRewards,
    uint16 _monstersKilled,
    bool _isCombat
  ) private view returns (uint length, bool noLuck) {
    length = _oldLength;

    // Easier to make it an array, but TODO update later
    ActionReward[] memory _randomRewards = new ActionReward[](4);
    uint randomRewardLength;
    if (_actionRewards.randomRewardTokenId1 != 0) {
      _randomRewards[randomRewardLength++] = ActionReward(
        _actionRewards.randomRewardTokenId1,
        _actionRewards.randomRewardChance1
      );
    }
    if (_actionRewards.randomRewardTokenId2 != 0) {
      _randomRewards[randomRewardLength++] = ActionReward(
        _actionRewards.randomRewardTokenId2,
        _actionRewards.randomRewardChance2
      );
    }
    if (_actionRewards.randomRewardTokenId3 != 0) {
      _randomRewards[randomRewardLength++] = ActionReward(
        _actionRewards.randomRewardTokenId3,
        _actionRewards.randomRewardChance3
      );
    }
    if (_actionRewards.randomRewardTokenId4 != 0) {
      _randomRewards[randomRewardLength++] = ActionReward(
        _actionRewards.randomRewardTokenId4,
        _actionRewards.randomRewardChance4
      );
    }

    assembly ("memory-safe") {
      mstore(_randomRewards, randomRewardLength)
    }

    if (_randomRewards.length > 0) {
      bool hasSeed = world.hasSeed(skillEndTime);
      if (hasSeed) {
        uint seed = world.getSeed(skillEndTime);

        // If combat use monsters killed, otherwise use elapsed time to see how many chances they get
        uint numTickets;
        if (_isCombat) {
          numTickets = _monstersKilled;
        } else {
          // (1 per hour spent)
          numTickets = elapsedTime / 3600;
        }
        bytes32 randomComponent = bytes32(seed) ^
          (bytes32(uint256(skillEndTime)) |
            (bytes32(uint256(skillEndTime)) << 64) |
            (bytes32(uint256(skillEndTime)) << 128) |
            (bytes32(uint256(skillEndTime)) << 192));
        uint startLootLength = length;
        for (uint i; i < numTickets; ++i) {
          // The random component is out of 65535, so we can take 2 bytes at a time
          uint16 rand = uint16(uint256(randomComponent >> (i * 16)));

          // Take each byte and check
          for (uint j; j < _randomRewards.length; ++j) {
            ActionReward memory potentialReward = _randomRewards[j];
            if (rand < potentialReward.rate) {
              // Get the lowest chance one

              // Compare with previous and append amounts if an entry already exists
              bool found;
              for (uint k = startLootLength; k < _ids.length; ++k) {
                if (potentialReward.itemTokenId == _ids[k]) {
                  // exists
                  _amounts[k] += 1;
                  found = true;
                  break;
                }
              }

              if (!found) {
                // New item
                _ids[length] = potentialReward.itemTokenId;
                _amounts[length] = 1;
                ++length;
              }
              break;
            }
          }
        }

        if (length == 0) {
          noLuck = true;
        }
      }
    }
  }

  function _processConsumablesView(
    address _from,
    QueuedAction storage _queuedAction,
    uint _elapsedTime,
    CombatStats memory _combatStats,
    ActionChoice memory _actionChoice
  )
    private
    view
    returns (Equipment[] memory consumedEquipment, Equipment memory output, uint xpElapsedTime, bool died)
  {
    consumedEquipment = new Equipment[](4);
    uint consumedEquipmentLength;

    // Figure out how much food should be consumed.
    // This is based on the damage done from battling
    uint16 numConsumed;
    bool isCombat = _isCombatStyle(_queuedAction.combatStyle);
    if (isCombat) {
      // Fetch the requirements for it
      CombatStats memory enemyCombatStats = world.getCombatStats(_queuedAction.actionId);

      uint combatElapsedTime;
      (xpElapsedTime, combatElapsedTime, numConsumed) = PlayerLibrary.getCombatAdjustedElapsedTimes(
        _from,
        itemNFT,
        world,
        _elapsedTime,
        _actionChoice,
        _queuedAction,
        _combatStats,
        enemyCombatStats
      );

      uint16 foodConsumed;
      (foodConsumed, died) = PlayerLibrary.foodConsumedView(
        _from,
        _queuedAction,
        combatElapsedTime,
        itemNFT,
        _combatStats,
        enemyCombatStats
      );

      if (_actionChoice.inputTokenId1 != NONE) {
        consumedEquipment[consumedEquipmentLength++] = Equipment(_queuedAction.regenerateId, foodConsumed);
      }
    } else {
      (xpElapsedTime, numConsumed) = PlayerLibrary.getNonCombatAdjustedElapsedTime(
        _from,
        itemNFT,
        _elapsedTime,
        _actionChoice
      );
    }

    if (numConsumed > 0) {
      if (_actionChoice.inputTokenId1 != NONE) {
        consumedEquipment[consumedEquipmentLength++] = Equipment(
          _actionChoice.inputTokenId1,
          numConsumed * _actionChoice.num1
        );
      }
      if (_actionChoice.inputTokenId2 != NONE) {
        consumedEquipment[consumedEquipmentLength++] = Equipment(
          _actionChoice.inputTokenId2,
          numConsumed * _actionChoice.num2
        );
      }
      if (_actionChoice.inputTokenId3 != NONE) {
        consumedEquipment[consumedEquipmentLength++] = Equipment(
          _actionChoice.inputTokenId3,
          numConsumed * _actionChoice.num3
        );
      }
    }

    if (_actionChoice.outputTokenId != 0) {
      output = Equipment(_actionChoice.outputTokenId, numConsumed);
    }

    assembly ("memory-safe") {
      mstore(consumedEquipment, consumedEquipmentLength)
    }
  }
}
