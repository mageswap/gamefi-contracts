import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {ClanRank} from "@paintswap/estfor-definitions/types";
import {expect} from "chai";
import {ethers} from "hardhat";
import {createPlayer} from "../../scripts/utils";
import {playersFixture} from "../Players/PlayersFixture";

describe("Clans", function () {
  async function clanFixture() {
    const fixture = await loadFixture(playersFixture);
    const {clans, playerId, alice, bankFactory} = fixture;

    // Add basic tier
    await clans.addTiers([
      {
        id: 1,
        maxMemberCapacity: 3,
        maxBankCapacity: 3,
        maxImageId: 16,
        price: 0,
        minimumAge: 0,
      },
    ]);

    const clanName = "Clan 1";

    const tierId = 1;
    const imageId = 2;
    const clanId = 1;
    const tier = await clans.tiers(tierId);

    // Figure out what the address with would
    const newContactAddr = ethers.utils.getContractAddress({
      from: bankFactory.address,
      nonce: clanId,
    });

    await expect(clans.connect(alice).createClan(playerId, clanName, imageId, tierId))
      .to.emit(clans, "ClanCreated")
      .withArgs(clanId, playerId, clanName, imageId, tierId)
      .and.to.emit(bankFactory, "BankContractCreated")
      .withArgs(alice.address, clanId, newContactAddr);

    return {...fixture, clans, clanName, tierId, imageId, clanId, tier};
  }
  describe("Create a clan", () => {
    it("New clan", async () => {
      const {clans, playerId, clanId, imageId, tierId, tier, clanName} = await loadFixture(clanFixture);

      // Check that the clan is created with the correct values
      const clan = await clans.clans(clanId);
      expect(clan.owner).to.eq(playerId);
      expect(clan.memberCount).to.eq(1);
      expect(clan.imageId).to.eq(imageId);
      expect(clan.tierId).to.eq(tierId);
      expect(clan.name).to.eq(clanName);
      expect(tier.maxMemberCapacity).to.eq(3);
      expect(tier.maxBankCapacity).to.eq(3);
      expect(await clans.canWithdraw(clanId, playerId)).to.be.true;
      expect(await clans.isClanMember(clanId, playerId)).to.be.true;
      expect(await clans.hasInviteRequest(clanId, playerId)).to.eq(false);

      const {timestamp} = await ethers.provider.getBlock("latest");
      expect(clan.createdTimestamp).to.eq(timestamp);

      // Check that the player is created with the correct values
      const player = await clans.playerInfo(playerId);
      expect(player.clanId).to.eq(clanId);
      expect(player.requestedClanId).to.eq(0);
    });

    it("Cannot create a clan if already in another", async () => {
      const {clans, playerId, alice, imageId, tierId, clanName} = await loadFixture(clanFixture);

      await expect(clans.connect(alice).createClan(playerId, clanName, imageId, tierId)).to.be.revertedWithCustomError(
        clans,
        "AlreadyInClan"
      );
    });

    it("Cannot create a clan with the same name", async () => {
      const {clans, bob, playerNFT, avatarId, imageId, tierId, clanName} = await loadFixture(clanFixture);
      const bobPlayerId = await createPlayer(playerNFT, avatarId, bob, "bob", true);
      await expect(clans.connect(bob).createClan(bobPlayerId, clanName, imageId, tierId)).to.be.revertedWithCustomError(
        clans,
        "NameAlreadyExists"
      );
    });

    it("Cannot create a clan, with invalid name (empty or > 20 chars)", async () => {
      // Also check that whitespace is trimmed
      const {clans, bob, playerNFT, avatarId, imageId, tierId} = await loadFixture(clanFixture);
      const bobPlayerId = await createPlayer(playerNFT, avatarId, bob, "bob", true);
      const name = " uhh$£";
      await expect(clans.connect(bob).createClan(bobPlayerId, name, imageId, tierId)).to.be.revertedWithCustomError(
        clans,
        "NameInvalidCharacters"
      );
    });

    it("Allowed to create a clan if there is a pending request elsewhere", async () => {
      const {clans, alice, bob, clanId, clanName, playerNFT, avatarId, playerId, tierId, imageId} = await loadFixture(
        clanFixture
      );
      const bobPlayerId = await createPlayer(playerNFT, avatarId, bob, "bob", true);
      await expect(clans.connect(alice).requestToJoin(clanId, playerId)).to.be.revertedWithCustomError(
        clans,
        "AlreadyInClan"
      );
      await expect(clans.connect(bob).requestToJoin(clanId + 1, bobPlayerId)).to.be.revertedWithCustomError(
        clans,
        "ClanDoesNotExist"
      );
      await clans.connect(bob).requestToJoin(clanId, bobPlayerId);
      let newPlayer = await clans.playerInfo(bobPlayerId);
      expect(newPlayer.clanId).to.eq(0);
      expect(newPlayer.requestedClanId).to.eq(clanId);

      await clans.connect(bob).createClan(bobPlayerId, clanName + "1", imageId, tierId);

      // Check that the player is created with the correct values
      newPlayer = await clans.playerInfo(bobPlayerId);
      expect(newPlayer.clanId).to.eq(clanId + 1);
      expect(newPlayer.requestedClanId).to.eq(0);
    });
  });

  describe("Edit clans", () => {
    it("Edited clan name should be freed and available", async () => {
      const {clans, alice, clanId, clanName, imageId} = await loadFixture(clanFixture);
      const anotherName = "Another name";
      await clans.connect(alice).editClan(clanId, anotherName, imageId);
      expect(await clans.lowercaseNames(clanName.toLowerCase())).to.be.false;
      expect(await clans.lowercaseNames(anotherName.toLowerCase())).to.be.true;

      await clans.connect(alice).editClan(clanId, anotherName, imageId); // Use same name, should not fail unless both the same
      await clans.connect(alice).editClan(clanId, clanName, imageId);
      expect(await clans.lowercaseNames(clanName.toLowerCase())).to.be.true;
      expect(await clans.lowercaseNames(anotherName.toLowerCase())).to.be.false;
      await clans.connect(alice).editClan(clanId, anotherName, imageId);
      await clans.connect(alice).editClan(clanId, anotherName, imageId + 1);
      expect(await clans.lowercaseNames(anotherName.toLowerCase())).to.be.true;
    });

    it("Edit clan image", async () => {
      const {clans, alice, clanId, clanName, imageId} = await loadFixture(clanFixture);
      await clans.connect(alice).editClan(clanId, clanName, imageId + 1);
    });
  });

  describe("Invites", () => {
    it("Invite a player to a clan", async () => {
      const {clans, playerId, alice, bob, clanId, playerNFT, avatarId} = await loadFixture(clanFixture);
      const bobPlayerId = await createPlayer(playerNFT, avatarId, bob, "bob", true);

      await clans.connect(alice).inviteMember(clanId, bobPlayerId, playerId);
      expect(await clans.hasInviteRequest(clanId, bobPlayerId)).to.be.true;
      expect(await clans.hasInviteRequest(clanId, playerId)).to.be.false; // sanity check
      await expect(clans.acceptInvite(clanId, bobPlayerId)).to.be.revertedWithCustomError(
        clans,
        "NotOwnerOfPlayerAndActive"
      );
      await clans.connect(bob).acceptInvite(clanId, bobPlayerId);

      expect(await clans.canWithdraw(clanId, bobPlayerId)).to.be.false;
      expect(await clans.isClanMember(clanId, bobPlayerId)).to.be.true;

      const newPlayer = await clans.playerInfo(bobPlayerId);
      expect(newPlayer.clanId).to.eq(clanId);
      expect(newPlayer.requestedClanId).to.eq(0);
    });

    it("Cannot accept an invite that does not exist", async () => {
      const {clans, bob, clanId, playerNFT, avatarId} = await loadFixture(clanFixture);
      const bobPlayerId = await createPlayer(playerNFT, avatarId, bob, "bob", true);

      await expect(clans.connect(bob).acceptInvite(clanId, bobPlayerId)).to.be.revertedWithCustomError(
        clans,
        "InviteDoesNotExist"
      );
    });

    it("Cannot invite a player to a clan if you are not at least a scout", async () => {
      const {clans, playerId, alice, bob, clanId, playerNFT, avatarId} = await loadFixture(clanFixture);
      const bobPlayerId = await createPlayer(playerNFT, avatarId, bob, "bob", true);

      await clans.connect(alice).changeRank(clanId, playerId, ClanRank.COMMONER, playerId);
      const player = await clans.playerInfo(playerId);
      expect(player.rank).to.eq(ClanRank.COMMONER);
      await expect(clans.connect(alice).inviteMember(clanId, bobPlayerId, playerId)).to.be.revertedWithCustomError(
        clans,
        "RankNotHighEnough"
      );
    });

    it("Delete invites as a player", async () => {
      const {clans, playerId, alice, bob, charlie, clanId, playerNFT, avatarId} = await loadFixture(clanFixture);
      const bobPlayerId = await createPlayer(playerNFT, avatarId, bob, "bob", true);

      await clans.connect(alice).inviteMember(clanId, bobPlayerId, playerId);
      await clans.connect(bob).acceptInvite(clanId, bobPlayerId);

      await expect(clans.connect(bob).deleteInvitesAsPlayer([clanId], bobPlayerId)).to.be.revertedWithCustomError(
        clans,
        "InviteDoesNotExist"
      );

      const charliePlayerId = await createPlayer(playerNFT, avatarId, charlie, "charlie", true);
      await clans.connect(alice).inviteMember(clanId, charliePlayerId, playerId);

      // Not the owner of the invite
      await expect(clans.deleteInvitesAsPlayer([clanId], charliePlayerId)).to.be.revertedWithCustomError(
        clans,
        "NotOwnerOfPlayer"
      );

      await expect(clans.connect(charlie).deleteInvitesAsPlayer([clanId], charliePlayerId))
        .to.emit(clans, "InvitesDeletedByPlayer")
        .withArgs([clanId], charliePlayerId);
      expect(await clans.hasInviteRequest(clanId, charliePlayerId)).to.be.false;
    });

    it("Delete invites as a clan", async () => {
      const {clans, playerId, alice, bob, charlie, clanId, playerNFT, avatarId} = await loadFixture(clanFixture);
      const bobPlayerId = await createPlayer(playerNFT, avatarId, bob, "bob", true);

      await clans.connect(alice).inviteMember(clanId, bobPlayerId, playerId);
      await clans.connect(bob).acceptInvite(clanId, bobPlayerId);
      expect(await clans.hasInviteRequest(clanId, bobPlayerId)).to.be.false;

      const charliePlayerId = await createPlayer(playerNFT, avatarId, charlie, "charlie", true);
      await clans.connect(alice).inviteMember(clanId, charliePlayerId, playerId);

      await expect(
        clans.connect(charlie).deleteInvitesAsClan(clanId, [charliePlayerId], charliePlayerId)
      ).to.be.revertedWithCustomError(clans, "NotMemberOfClan");

      // Not a scout
      await expect(
        clans.connect(bob).deleteInvitesAsClan(clanId, [charliePlayerId], bobPlayerId)
      ).to.be.revertedWithCustomError(clans, "RankNotHighEnough");

      await clans.connect(alice).changeRank(clanId, bobPlayerId, ClanRank.SCOUT, playerId);
      await expect(clans.connect(bob).deleteInvitesAsClan(clanId, [charliePlayerId], bobPlayerId))
        .to.emit(clans, "InvitesDeletedByClan")
        .withArgs(clanId, [charliePlayerId], bobPlayerId);
      expect(await clans.hasInviteRequest(clanId, charliePlayerId)).to.be.false;
    });
  });

  describe("Treasurers", () => {
    it("Must be a member to be promoted to admin", async () => {
      const {clans, playerId, alice, bob, clanId, playerNFT, avatarId} = await loadFixture(clanFixture);
      const bobPlayerId = await createPlayer(playerNFT, avatarId, bob, "bob", true);
      await clans.connect(bob).requestToJoin(clanId, bobPlayerId);

      await expect(
        clans.connect(alice).changeRank(clanId, bobPlayerId, ClanRank.TREASURER, playerId)
      ).to.be.revertedWithCustomError(clans, "NotMemberOfClan");
      await clans.connect(alice).acceptJoinRequest(clanId, bobPlayerId, playerId);
      await clans.connect(alice).changeRank(clanId, bobPlayerId, ClanRank.TREASURER, playerId);

      expect(await clans.canWithdraw(clanId, bobPlayerId)).to.be.true;
      expect(await clans.isClanMember(clanId, bobPlayerId)).to.be.true;

      const newPlayer = await clans.playerInfo(bobPlayerId);
      expect(newPlayer.clanId).to.eq(clanId);
      expect(newPlayer.requestedClanId).to.eq(0);
    });

    it("Only owner can add new treasurers", async () => {
      const {clans, playerId, alice, bob, charlie, clanId, playerNFT, avatarId} = await loadFixture(clanFixture);

      const bobPlayerId = await createPlayer(playerNFT, avatarId, bob, "bob", true);
      await clans.connect(bob).requestToJoin(clanId, bobPlayerId);

      await expect(
        clans.connect(alice).changeRank(clanId, bobPlayerId, ClanRank.TREASURER, playerId)
      ).to.be.revertedWithCustomError(clans, "NotMemberOfClan");
      await clans.connect(alice).acceptJoinRequest(clanId, bobPlayerId, playerId);
      await clans.connect(alice).changeRank(clanId, bobPlayerId, ClanRank.TREASURER, playerId);
      await expect(
        clans.connect(alice).changeRank(clanId, bobPlayerId, ClanRank.TREASURER, playerId)
      ).to.be.revertedWithCustomError(clans, "CannotSetSameRank");

      expect(await clans.canWithdraw(clanId, bobPlayerId)).to.be.true;
      expect(await clans.isClanMember(clanId, bobPlayerId)).to.be.true;

      const newPlayer = await clans.playerInfo(bobPlayerId);
      expect(newPlayer.clanId).to.eq(clanId);
      expect(newPlayer.requestedClanId).to.eq(0);

      const charliePlayerId = await createPlayer(playerNFT, avatarId, charlie, "charlie", true);

      await clans.connect(charlie).requestToJoin(clanId, charliePlayerId);
      await clans.connect(bob).acceptJoinRequest(clanId, charliePlayerId, bobPlayerId);
      await expect(
        clans.changeRank(clanId, charliePlayerId, ClanRank.TREASURER, charliePlayerId)
      ).to.be.revertedWithCustomError(clans, "NotOwnerOfPlayer");
    });

    it("Only owner can remove treasurers", async () => {
      const {clans, playerId, alice, bob, clanId, playerNFT, avatarId} = await loadFixture(clanFixture);
      const bobPlayerId = await createPlayer(playerNFT, avatarId, bob, "bob", true);
      await clans.connect(bob).requestToJoin(clanId, bobPlayerId);
      await clans.connect(alice).acceptJoinRequest(clanId, bobPlayerId, playerId);
      await clans.connect(alice).changeRank(clanId, bobPlayerId, ClanRank.TREASURER, playerId);

      await expect(
        clans.connect(bob).changeRank(clanId, playerId, ClanRank.SCOUT, bobPlayerId)
      ).to.be.revertedWithCustomError(clans, "ChangingRankOfPlayerEqualOrHigherThanSelf");
      await clans.connect(alice).changeRank(clanId, bobPlayerId, ClanRank.SCOUT, playerId);

      expect(await clans.canWithdraw(clanId, bobPlayerId)).to.be.false;
      expect(await clans.isClanMember(clanId, bobPlayerId)).to.be.true;

      const newPlayer = await clans.playerInfo(bobPlayerId);
      expect(newPlayer.clanId).to.eq(clanId);
      expect(newPlayer.requestedClanId).to.eq(0);
    });

    it("Scouts and above can changes members below them in rank", async () => {
      const {clans, playerId, alice, bob, charlie, dog, clanId, playerNFT, avatarId} = await loadFixture(clanFixture);

      const dogPlayerId = await createPlayer(playerNFT, avatarId, dog, "dog", true);
      await clans.connect(dog).requestToJoin(clanId, dogPlayerId);
      await clans.connect(alice).acceptJoinRequest(clanId, dogPlayerId, playerId);
      await clans.connect(alice).changeRank(clanId, dogPlayerId, ClanRank.SCOUT, playerId);

      const bobPlayerId = await createPlayer(playerNFT, avatarId, bob, "bob", true);

      await clans.connect(bob).requestToJoin(clanId, bobPlayerId);
      await clans.connect(dog).acceptJoinRequest(clanId, bobPlayerId, dogPlayerId);
      expect(await clans.isClanMember(clanId, bobPlayerId)).to.be.true;
      await expect(clans.changeRank(clanId, bobPlayerId, ClanRank.SCOUT, playerId)).to.be.revertedWithCustomError(
        clans,
        "NotOwnerOfPlayer"
      );
      await clans.connect(alice).changeRank(clanId, bobPlayerId, ClanRank.SCOUT, playerId);

      // Cannot change rank of someone of the same rank
      await expect(
        clans.connect(dog).changeRank(clanId, bobPlayerId, ClanRank.SCOUT, dogPlayerId)
      ).to.be.revertedWithCustomError(clans, "ChangingRankEqualOrHigherThanSelf");

      // Remove self as scout to commoner
      await clans.connect(dog).changeRank(clanId, dogPlayerId, ClanRank.COMMONER, dogPlayerId);
      expect(await clans.canWithdraw(clanId, dogPlayerId)).to.be.false;
      expect(await clans.isClanMember(clanId, dogPlayerId)).to.be.true;

      // Kick this user from the clan
      await clans.connect(bob).changeRank(clanId, dogPlayerId, ClanRank.NONE, bobPlayerId);

      const charliePlayerId = await createPlayer(playerNFT, avatarId, charlie, "charlie", true);

      await clans.connect(charlie).requestToJoin(clanId, charliePlayerId);
      await clans.connect(bob).acceptJoinRequest(clanId, charliePlayerId, bobPlayerId);
      await expect(
        clans.connect(dog).changeRank(clanId, charliePlayerId, ClanRank.NONE, dogPlayerId)
      ).to.be.revertedWithCustomError(clans, "ChangingRankEqualOrHigherThanSelf");

      // Scout can remove a member
      await clans.connect(bob).changeRank(clanId, charliePlayerId, ClanRank.NONE, bobPlayerId);

      expect(await clans.canWithdraw(clanId, dogPlayerId)).to.be.false;
      expect(await clans.isClanMember(clanId, dogPlayerId)).to.be.false;

      const newPlayer = await clans.playerInfo(dogPlayerId);
      expect(newPlayer.clanId).to.eq(0);
      expect(newPlayer.requestedClanId).to.eq(0);
    });
  });

  it("Check max capacity of added members", async function () {
    const {clans, playerId, alice, owner, bob, charlie, clanId, tierId, playerNFT, avatarId} = await loadFixture(
      clanFixture
    );
    const maxMemberCapacity = (await clans.tiers(tierId)).maxMemberCapacity;

    const bobPlayerId = await createPlayer(playerNFT, avatarId, bob, "bob", true);
    await clans.connect(alice).inviteMember(clanId, bobPlayerId, playerId); // Invite now as it won't be possible later when full

    for (let i = 0; i < maxMemberCapacity - 1; ++i) {
      const charliePlayerId = await createPlayer(playerNFT, avatarId, charlie, "charlie" + i, true);
      await clans.connect(alice).inviteMember(clanId, charliePlayerId, playerId);
      await clans.connect(charlie).acceptInvite(clanId, charliePlayerId);
    }

    // Should be max capacity
    await expect(clans.connect(bob).acceptInvite(clanId, bobPlayerId)).to.be.revertedWithCustomError(
      clans,
      "ClanIsFull"
    );
    const newPlayerId = await createPlayer(playerNFT, avatarId, owner, "unique name1", true);
    await expect(clans.connect(alice).inviteMember(clanId, newPlayerId, playerId)).to.be.revertedWithCustomError(
      clans,
      "ClanIsFull"
    );

    await clans.connect(bob).requestToJoin(clanId, bobPlayerId);
    await expect(clans.connect(alice).acceptJoinRequest(clanId, bobPlayerId, playerId)).to.be.revertedWithCustomError(
      clans,
      "ClanIsFull"
    );
  });

  it("Check getClanName is case sensitive", async function () {
    const {clans, playerId, clanName} = await loadFixture(clanFixture);
    expect(await clans.getClanNameOfPlayer(playerId)).to.eq(clanName);
  });

  describe("Renounce ownership", () => {
    it("Must be owner to renounce", async function () {
      const {clans, playerId, alice, bob, clanId, playerNFT, avatarId} = await loadFixture(clanFixture);

      await expect(
        clans.connect(alice).renounceOwnershipTo(clanId, playerId, ClanRank.COMMONER)
      ).to.be.revertedWithCustomError(clans, "CannotRenounceToSelf");

      const bobPlayerId = await createPlayer(playerNFT, avatarId, bob, "unique name", true);
      await clans.connect(alice).inviteMember(clanId, bobPlayerId, playerId); // Invite now as it won't be possible later when full
      await clans.connect(bob).acceptInvite(clanId, bobPlayerId);
      // Bob is now the leader
      await clans.connect(alice).renounceOwnershipTo(clanId, bobPlayerId, ClanRank.COMMONER);

      // Leader should now be a commoner
      const oldLeaderPlayerInfo = await clans.connect(alice).playerInfo(playerId);
      expect(oldLeaderPlayerInfo.rank).to.eq(ClanRank.COMMONER);
      expect(oldLeaderPlayerInfo.clanId).to.eq(clanId);

      // Check owner transferred to bob and other clan details
      const clan = await clans.connect(alice).clans(clanId);
      await expect(clan.owner).to.eq(bobPlayerId);
      await expect(clan.memberCount).to.eq(2);

      // Cannot renounce now as you aren't owner
      await expect(
        clans.connect(alice).renounceOwnershipTo(clanId, bobPlayerId, ClanRank.COMMONER)
      ).to.be.revertedWithCustomError(clans, "NotOwnerOfPlayer");
    });

    it("Can only renounce to a member", async function () {
      const {clans, playerId, alice, bob, clanId, playerNFT, avatarId} = await loadFixture(clanFixture);
      const bobPlayerId = await createPlayer(playerNFT, avatarId, bob, "unique name", true);
      await clans.connect(alice).inviteMember(clanId, bobPlayerId, playerId);
      await expect(
        clans.connect(alice).renounceOwnershipTo(clanId, bobPlayerId, ClanRank.COMMONER)
      ).to.be.revertedWithCustomError(clans, "NotMemberOfClan");
    });
  });

  it("Commoner leave clan", async function () {
    const {clans, playerId, alice, clanId} = await loadFixture(clanFixture);
    await clans.connect(alice).changeRank(clanId, playerId, ClanRank.COMMONER, playerId);
    await clans.connect(alice).changeRank(clanId, playerId, ClanRank.NONE, playerId);
  });

  it("Claim ownership of clan with no leader", async function () {
    const {clans, playerId, alice, bob, charlie, clanId, playerNFT, avatarId} = await loadFixture(clanFixture);
    const bobPlayerId = await createPlayer(playerNFT, avatarId, bob, "bob", true);
    await clans.connect(alice).inviteMember(clanId, bobPlayerId, playerId);

    await expect(clans.connect(bob).claimOwnership(clanId, bobPlayerId)).to.be.revertedWithCustomError(
      clans,
      "NotMemberOfClan"
    );

    const charliePlayerId = await createPlayer(playerNFT, avatarId, charlie, "charlie", true);
    await clans.connect(alice).inviteMember(clanId, charliePlayerId, playerId);
    await clans.connect(charlie).acceptInvite(clanId, charliePlayerId);

    await expect(clans.connect(charlie).claimOwnership(clanId, charliePlayerId)).to.be.revertedWithCustomError(
      clans,
      "OwnerExists"
    );

    await expect(clans.connect(alice).changeRank(clanId, playerId, ClanRank.NONE, playerId))
      .to.emit(clans, "ClanOwnerLeft")
      .withArgs(clanId, playerId);
    let clan = await clans.connect(alice).clans(clanId);
    await expect(clan.owner).to.eq(0);
    await expect(clan.memberCount).to.eq(1);

    await expect(clans.connect(bob).claimOwnership(clanId, bobPlayerId)).to.be.revertedWithCustomError(
      clans,
      "NotMemberOfClan"
    );
    await clans.connect(bob).acceptInvite(clanId, bobPlayerId);
    await clans.connect(bob).claimOwnership(clanId, bobPlayerId);

    clan = await clans.connect(alice).clans(clanId);
    await expect(clan.owner).to.eq(bobPlayerId);
    await expect(clan.memberCount).to.eq(2);
  });

  describe("Clan upgrades", () => {
    async function upgradedClansFixture() {
      const fixture = await loadFixture(clanFixture);
      const {clans} = fixture;

      await clans.addTiers([
        {
          id: 2,
          maxMemberCapacity: 10,
          maxBankCapacity: 10,
          maxImageId: 16,
          price: 10,
          minimumAge: 0,
        },
      ]);

      await clans.addTiers([
        {
          id: 3,
          maxMemberCapacity: 20,
          maxBankCapacity: 10,
          maxImageId: 30,
          price: 100,
          minimumAge: 0,
        },
      ]);

      return {...fixture, clans};
    }

    it("Anyone can upgrade", async function () {
      const {clans, clanId, playerId, alice, brush} = await loadFixture(upgradedClansFixture);

      await expect(clans.connect(alice).upgradeClan(clanId, playerId, 2)).to.be.revertedWith(
        "ERC20: insufficient allowance"
      );
      const brushAmount = (await clans.tiers(2)).price;
      await brush.mint(alice.address, brushAmount - 1);
      await brush.connect(alice).approve(clans.address, brushAmount);
      await expect(clans.connect(alice).upgradeClan(clanId, playerId, 2)).to.be.revertedWith(
        "ERC20: transfer amount exceeds balance"
      );
      await brush.mint(alice.address, 1);
      await clans.connect(alice).upgradeClan(clanId, playerId, 2);
      const clan = await clans.clans(clanId);
      expect(clan.tierId).to.eq(2);
    });

    it("Pay the difference for incremental upgrades", async function () {
      const {clans, clanId, alice, playerId, brush} = await loadFixture(upgradedClansFixture);

      const brushAmount = (await clans.tiers(3)).price;
      await brush.mint(alice.address, brushAmount);
      const beforeBalance = await brush.balanceOf(alice.address);
      await brush.connect(alice).approve(clans.address, brushAmount);

      await clans.connect(alice).upgradeClan(clanId, playerId, 2);
      expect(await brush.balanceOf(alice.address)).to.eq(beforeBalance.sub((await clans.tiers(2)).price));
      await clans.connect(alice).upgradeClan(clanId, playerId, 3);
      expect(await brush.balanceOf(alice.address)).to.eq(beforeBalance.sub(brushAmount));
    });

    it("Cannot upgrade to a tier that doesn't exist", async function () {
      const {clans, clanId, playerNFT, avatarId, bob, brush} = await loadFixture(upgradedClansFixture);

      const bobPlayerId = await createPlayer(playerNFT, avatarId, bob, "bob", true);
      const brushAmount = (await clans.tiers(4)).price;
      expect(brushAmount).to.eq(0);
      await brush.mint(bob.address, 1000);
      await brush.connect(bob).approve(clans.address, 1000);

      await expect(clans.connect(bob).upgradeClan(clanId, bobPlayerId, 4)).to.be.revertedWithCustomError(
        clans,
        "TierDoesNotExist"
      );
    });
  });
});