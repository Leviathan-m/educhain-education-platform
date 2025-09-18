const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EducationNFT", function () {
  let educationNFT;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const EducationNFT = await ethers.getContractFactory("EducationNFT");
    educationNFT = await EducationNFT.deploy();
    await educationNFT.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await educationNFT.owner()).to.equal(owner.address);
    });

    it("Should have correct name and symbol", async function () {
      expect(await educationNFT.name()).to.equal("EducationNFT");
      expect(await educationNFT.symbol()).to.equal("EDU");
    });
  });

  describe("Minting", function () {
    it("Should mint a certificate successfully", async function () {
      const courseName = "Blockchain Development";
      const studentName = "John Doe";
      const studentEmail = "john@example.com";
      const completionDate = Math.floor(Date.now() / 1000);
      const ipfsHash = "QmTest123";
      const aiScore = "95%";

      await expect(
        educationNFT.mintCertificate(
          addr1.address,
          courseName,
          studentName,
          studentEmail,
          completionDate,
          ipfsHash,
          aiScore
        )
      )
        .to.emit(educationNFT, "CertificateMinted")
        .withArgs(1, addr1.address, courseName, studentName);

      expect(await educationNFT.ownerOf(1)).to.equal(addr1.address);
      expect(await educationNFT.totalSupply()).to.equal(1);
    });

    it("Should fail to mint with invalid parameters", async function () {
      await expect(
        educationNFT.mintCertificate(
          ethers.ZeroAddress,
          "Course",
          "Student",
          "email@test.com",
          Math.floor(Date.now() / 1000),
          "QmTest123",
          "95%"
        )
      ).to.be.revertedWith("Cannot mint to zero address");

      await expect(
        educationNFT.mintCertificate(
          addr1.address,
          "", // empty course name
          "Student",
          "email@test.com",
          Math.floor(Date.now() / 1000),
          "QmTest123",
          "95%"
        )
      ).to.be.revertedWith("Course name cannot be empty");
    });

    it("Should only allow owner to mint", async function () {
      await expect(
        educationNFT.connect(addr1).mintCertificate(
          addr2.address,
          "Course",
          "Student",
          "email@test.com",
          Math.floor(Date.now() / 1000),
          "QmTest123",
          "95%"
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Certificate Data", function () {
    beforeEach(async function () {
      await educationNFT.mintCertificate(
        addr1.address,
        "Test Course",
        "Test Student",
        "test@example.com",
        Math.floor(Date.now() / 1000),
        "QmTest123",
        "90%"
      );
    });

    it("Should return correct certificate data", async function () {
      const cert = await educationNFT.getCertificate(1);

      expect(cert[0]).to.equal("Test Course"); // courseName
      expect(cert[1]).to.equal("Test Student"); // studentName
      expect(cert[2]).to.equal("test@example.com"); // studentEmail
      expect(cert[6]).to.equal(true); // isVerified
    });

    it("Should verify certificate correctly", async function () {
      expect(await educationNFT.verifyCertificate(1)).to.equal(true);
      expect(await educationNFT.verifyCertificate(999)).to.equal(false);
    });

    it("Should return correct token URI", async function () {
      const uri = await educationNFT.tokenURI(1);
      expect(uri).to.equal("https://ipfs.io/ipfs/QmTest123");
    });
  });

  describe("Transfers", function () {
    beforeEach(async function () {
      await educationNFT.mintCertificate(
        addr1.address,
        "Transfer Test",
        "Transfer Student",
        "transfer@example.com",
        Math.floor(Date.now() / 1000),
        "QmTransfer",
        "85%"
      );
    });

    it("Should allow transfers between addresses", async function () {
      await educationNFT.connect(addr1).transferFrom(addr1.address, addr2.address, 1);

      expect(await educationNFT.ownerOf(1)).to.equal(addr2.address);
    });

    it("Should not allow transfers when paused", async function () {
      await educationNFT.setPaused(true);

      await expect(
        educationNFT.connect(addr1).transferFrom(addr1.address, addr2.address, 1)
      ).to.be.revertedWith("Contract is paused");
    });
  });

  describe("Burning", function () {
    beforeEach(async function () {
      await educationNFT.mintCertificate(
        addr1.address,
        "Burn Test",
        "Burn Student",
        "burn@example.com",
        Math.floor(Date.now() / 1000),
        "QmBurn",
        "80%"
      );
    });

    it("Should allow owner to burn their certificate", async function () {
      await educationNFT.connect(addr1).burn(1);

      await expect(educationNFT.ownerOf(1)).to.be.revertedWith("ERC721: invalid token ID");
      expect(await educationNFT.totalSupply()).to.equal(0);
    });

    it("Should not allow burning non-owned certificates", async function () {
      await expect(
        educationNFT.connect(addr2).burn(1)
      ).to.be.revertedWith("Caller is not owner nor approved");
    });
  });
});
