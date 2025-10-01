// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract EducationCredentialNFT is
    Initializable,
    ERC721Upgradeable,
    OwnableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIdCounter;

    // Roles
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // Enhanced Certificate structure
    struct Credential {
        string courseHash;          // 과정 식별자 해시
        string studentHash;         // 학습자 식별자 해시 (프라이버시 보호)
        uint256 completionDate;     // 수료일 타임스탬프
        string evaluationHash;      // AI 평가 결과 해시
        string ipfsMetadata;        // IPFS 메타데이터 CID
        uint8 credentialType;       // 1:Certificate, 2:Badge, 3:Diploma, 4:MicroCredential
        bool isRevocable;          // 취소 가능 여부
        bool isSoulbound;          // SBT (Soulbound Token) 여부
        address issuer;            // 발행 기관 주소
        uint256 validUntil;        // 유효기간 (0 = 영구)
        bytes32 zkProof;          // Zero Knowledge Proof 해시
        bool isVerified;          // 추가 검증 여부 (오프체인/관리자)
    }

    // Storage
    mapping(uint256 => Credential) public credentials;
    mapping(bytes32 => bool) public usedHashes; // 중복 발행 방지
    mapping(uint256 => bool) public revokedCredentials; // 취소된 자격증
    mapping(address => uint256[]) public issuerCredentials; // 발행기관별 자격증 목록

    // Cross-chain support
    mapping(uint16 => mapping(uint256 => bool)) public mintedOnChain; // chainId => tokenId => minted

    // Emergency controls
    bool public emergencyPaused;

    // Events
    event CredentialMinted(
        uint256 indexed tokenId,
        address indexed recipient,
        string courseHash,
        uint256 completionDate,
        uint8 credentialType
    );

    event CredentialVerified(
        uint256 indexed tokenId,
        address indexed verifier,
        bool isValid,
        string reason
    );

    event CredentialRevoked(
        uint256 indexed tokenId,
        address indexed revoker,
        string reason
    );

    event CredentialTransferred(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __ERC721_init("EducationCredentialNFT", "ECNFT");
        __Ownable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ISSUER_ROLE, msg.sender);
        _grantRole(VERIFIER_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);
    }

    /**
     * @dev Mint a new educational credential NFT
     * @param to The address that will own the credential
     * @param courseHash Hash of the completed course
     * @param studentHash Hash of the student identifier (privacy-preserving)
     * @param evaluationHash Hash of the AI evaluation result
     * @param ipfsMetadata IPFS CID of the credential metadata
     * @param credentialType Type of credential (1:Certificate, 2:Badge, 3:Diploma, 4:MicroCredential)
     * @param isSoulbound Whether this is a Soulbound Token
     * @param validUntil Expiration timestamp (0 = permanent)
     * @param zkProof Zero Knowledge Proof hash for privacy
     */
    function mintCredential(
        address to,
        string memory courseHash,
        string memory studentHash,
        string memory evaluationHash,
        string memory ipfsMetadata,
        uint8 credentialType,
        bool isSoulbound,
        uint256 validUntil,
        bytes32 zkProof
    ) external onlyRole(ISSUER_ROLE) whenNotPaused returns (uint256) {
        require(to != address(0), "Cannot mint to zero address");
        require(bytes(courseHash).length > 0, "Course hash cannot be empty");
        require(bytes(studentHash).length > 0, "Student hash cannot be empty");
        require(bytes(ipfsMetadata).length > 0, "IPFS metadata cannot be empty");
        require(credentialType >= 1 && credentialType <= 4, "Invalid credential type");
        require(validUntil == 0 || validUntil > block.timestamp, "Invalid expiration date");

        // Prevent duplicate credentials
        bytes32 credentialHash = keccak256(abi.encodePacked(courseHash, studentHash));
        require(!usedHashes[credentialHash], "Credential already exists");

        _tokenIdCounter.increment();
        uint256 tokenId = _tokenIdCounter.current();

        // Create enhanced credential
        credentials[tokenId] = Credential({
            courseHash: courseHash,
            studentHash: studentHash,
            completionDate: block.timestamp,
            evaluationHash: evaluationHash,
            ipfsMetadata: ipfsMetadata,
            credentialType: credentialType,
            isRevocable: !isSoulbound,
            isSoulbound: isSoulbound,
            issuer: msg.sender,
            validUntil: validUntil,
            zkProof: zkProof
        });

        usedHashes[credentialHash] = true;
        issuerCredentials[msg.sender].push(tokenId);

        // Mint the NFT
        _safeMint(to, tokenId);

        emit CredentialMinted(tokenId, to, courseHash, block.timestamp, credentialType);

        return tokenId;
    }

    /**
     * @dev Batch mint multiple credentials (gas optimized)
     */
    struct BatchMintRequest {
        address[] recipients;
        string[] courseHashes;
        string[] studentHashes;
        string[] evaluationHashes;
        string[] ipfsMetadata;
        uint8[] credentialTypes;
        bool[] isSoulbound;
        uint256[] validUntils;
        bytes32[] zkProofs;
    }

    function batchMintCredentials(
        BatchMintRequest memory request
    ) external onlyRole(ISSUER_ROLE) whenNotPaused nonReentrant {
        require(request.recipients.length <= 50, "Batch size too large");
        require(request.recipients.length == request.courseHashes.length, "Array length mismatch");

        for (uint256 i = 0; i < request.recipients.length; i++) {
            _mintSingleCredential(
                request.recipients[i],
                request.courseHashes[i],
                request.studentHashes[i],
                request.evaluationHashes[i],
                request.ipfsMetadata[i],
                request.credentialTypes[i],
                request.isSoulbound[i],
                request.validUntils[i],
                request.zkProofs[i]
            );
        }
    }

    function _mintSingleCredential(
        address to,
        string memory courseHash,
        string memory studentHash,
        string memory evaluationHash,
        string memory ipfsMetadata,
        uint8 credentialType,
        bool isSoulbound,
        uint256 validUntil,
        bytes32 zkProof
    ) internal {
        bytes32 credentialHash = keccak256(abi.encodePacked(courseHash, studentHash));
        require(!usedHashes[credentialHash], "Credential already exists");

        _tokenIdCounter.increment();
        uint256 tokenId = _tokenIdCounter.current();

        credentials[tokenId] = Credential({
            courseHash: courseHash,
            studentHash: studentHash,
            completionDate: block.timestamp,
            evaluationHash: evaluationHash,
            ipfsMetadata: ipfsMetadata,
            credentialType: credentialType,
            isRevocable: !isSoulbound,
            isSoulbound: isSoulbound,
            issuer: msg.sender,
            validUntil: validUntil,
            zkProof: zkProof
        });

        usedHashes[credentialHash] = true;
        issuerCredentials[msg.sender].push(tokenId);

        _safeMint(to, tokenId);

        emit CredentialMinted(tokenId, to, courseHash, block.timestamp, credentialType);
    }

    /**
     * @dev Get credential data by token ID
     * @param tokenId The token ID to query
     */
    function getCredential(uint256 tokenId)
        public
        view
        returns (
            string memory courseHash,
            string memory studentHash,
            uint256 completionDate,
            string memory evaluationHash,
            string memory ipfsMetadata,
            uint8 credentialType,
            bool isRevocable,
            bool isSoulbound,
            address issuer,
            uint256 validUntil,
            bytes32 zkProof
        )
    {
        require(_exists(tokenId), "Credential does not exist");

        Credential memory cred = credentials[tokenId];
        return (
            cred.courseHash,
            cred.studentHash,
            cred.completionDate,
            cred.evaluationHash,
            cred.ipfsMetadata,
            cred.credentialType,
            cred.isRevocable,
            cred.isSoulbound,
            cred.issuer,
            cred.validUntil,
            cred.zkProof
        );
    }

    /**
     * @dev Verify credential authenticity and validity
     * @param tokenId The token ID to verify
     */
    function verifyCredential(uint256 tokenId)
        external
        view
        returns (bool isValid, string memory reason)
    {
        if (!_exists(tokenId)) {
            return (false, "Credential does not exist");
        }

        if (revokedCredentials[tokenId]) {
            return (false, "Credential has been revoked");
        }

        Credential memory cred = credentials[tokenId];

        // Check expiration
        if (cred.validUntil > 0 && cred.validUntil < block.timestamp) {
            return (false, "Credential has expired");
        }

        // Additional verification logic can be added here
        // - Issuer reputation check
        // - Cross-chain verification
        // - Oracle-based verification

        return (true, "Credential is valid");
    }

    /**
     * @dev Revoke a credential (only by issuer or admin)
     * @param tokenId The token ID to revoke
     * @param reason The reason for revocation
     */
    function revokeCredential(uint256 tokenId, string memory reason)
        external
        onlyRole(ISSUER_ROLE)
    {
        require(_exists(tokenId), "Credential does not exist");

        Credential memory cred = credentials[tokenId];
        require(cred.isRevocable, "Credential is not revocable");
        require(cred.issuer == msg.sender || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
                "Not authorized to revoke this credential");

        revokedCredentials[tokenId] = true;

        emit CredentialRevoked(tokenId, msg.sender, reason);
    }

    /**
     * @dev Get credentials issued by an address
     * @param issuer The issuer address
     */
    function getIssuerCredentials(address issuer)
        external
        view
        returns (uint256[] memory)
    {
        return issuerCredentials[issuer];
    }

    /**
     * @dev Check if credential is expired
     * @param tokenId The token ID to check
     */
    function isCredentialExpired(uint256 tokenId)
        public
        view
        returns (bool)
    {
        if (!_exists(tokenId)) return true;

        Credential memory cred = credentials[tokenId];
        return cred.validUntil > 0 && cred.validUntil < block.timestamp;
    }

    /**
     * @dev Get total number of certificates minted
     */
    function totalSupply() public view returns (uint256) {
        return _tokenIdCounter.current();
    }

    /**
     * @dev Override tokenURI to return IPFS metadata URL
     * @param tokenId The token ID
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        require(_exists(tokenId), "URI query for nonexistent token");
        Credential memory cred = credentials[tokenId];
        require(bytes(cred.ipfsMetadata).length > 0, "IPFS metadata not set");

        // Return IPFS URL
        return string(abi.encodePacked("https://ipfs.io/ipfs/", cred.ipfsMetadata));
    }

    /**
     * @dev Override token transfer to enforce SBT restrictions
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override whenNotPaused {
        // Check if token is soulbound
        require(!credentials[tokenId].isSoulbound || from == address(0),
                "Soulbound token cannot be transferred");

        // Check if token is revoked
        require(!revokedCredentials[tokenId], "Revoked credential cannot be transferred");

        // Check expiration inline (avoid external call)
        Credential memory cred = credentials[tokenId];
        require(!(cred.validUntil > 0 && cred.validUntil < block.timestamp), "Expired credential cannot be transferred");

        super._beforeTokenTransfer(from, to, tokenId, batchSize);

        if (from != to && from != address(0)) {
            emit CredentialTransferred(tokenId, from, to);
        }
    }

    /**
     * @dev Transfer credential (with SBT restrictions)
     */
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public override {
        require(!credentials[tokenId].isSoulbound, "Soulbound tokens cannot be transferred");
        super.transferFrom(from, to, tokenId);
    }

    /**
     * @dev Safe transfer credential
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public override {
        require(!credentials[tokenId].isSoulbound, "Soulbound tokens cannot be transferred");
        super.safeTransferFrom(from, to, tokenId);
    }

    /**
     * @dev Safe transfer with data
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) public override {
        require(!credentials[tokenId].isSoulbound, "Soulbound tokens cannot be transferred");
        super.safeTransferFrom(from, to, tokenId, data);
    }

    /**
     * @dev Burn credential (only by owner or approved, and only if revocable)
     * @param tokenId Token ID to burn
     */
    function burn(uint256 tokenId) public {
        require(_isApprovedOrOwner(_msgSender(), tokenId), "Caller is not owner nor approved");

        Credential memory cred = credentials[tokenId];
        require(cred.isRevocable, "Soulbound tokens cannot be burned");

        _burn(tokenId);

        // Clean up credential data
        delete credentials[tokenId];
        delete revokedCredentials[tokenId];

        // Remove from issuer's list
        _removeFromIssuerList(cred.issuer, tokenId);
    }

    function _removeFromIssuerList(address issuer, uint256 tokenId) internal {
        uint256[] storage issuerList = issuerCredentials[issuer];
        for (uint256 i = 0; i < issuerList.length; i++) {
            if (issuerList[i] == tokenId) {
                issuerList[i] = issuerList[issuerList.length - 1];
                issuerList.pop();
                break;
            }
        }
    }

    /**
     * @dev Get certificates owned by an address
     * @param owner The address to query
     */
    function getCertificatesByOwner(address owner)
        public
        view
        returns (uint256[] memory)
    {
        uint256 totalTokens = totalSupply();
        uint256[] memory tempTokens = new uint256[](totalTokens);
        uint256 count = 0;

        for (uint256 i = 1; i <= totalTokens; i++) {
            if (_exists(i) && ownerOf(i) == owner) {
                tempTokens[count] = i;
                count++;
            }
        }

        // Copy to properly sized array
        uint256[] memory ownedTokens = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ownedTokens[i] = tempTokens[i];
        }

        return ownedTokens;
    }

    /**
     * @dev Update certificate verification status (only owner)
     * @param tokenId Token ID
     * @param isValid New verification status
     */
    function setCredentialVerification(uint256 tokenId, bool isValid, string memory reason) public onlyRole(VERIFIER_ROLE) {
        require(_exists(tokenId), "Credential does not exist");
        credentials[tokenId].isVerified = isValid;
        emit CredentialVerified(tokenId, msg.sender, isValid, reason);
    }

    /**
     * @dev Emergency pause/unpause functionality
     */
    function setEmergencyPause(bool _paused) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emergencyPaused = _paused;
    }

    /**
     * @dev Check if contract is paused
     */
    function isPaused() external view returns (bool) {
        return emergencyPaused || paused();
    }

    /**
     * @dev UUPS Upgradeable function
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        onlyRole(UPGRADER_ROLE)
        override
    {}

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev Get contract version
     */
    function getVersion() external pure returns (string memory) {
        return "2.0.0";
    }

    /**
     * @dev Get credential statistics
     */
    function getCredentialStats() external view returns (
        uint256 totalSupply_,
        uint256 totalRevoked,
        uint256 totalSoulbound,
        uint256 totalExpired
    ) {
        uint256 revoked = 0;
        uint256 soulbound = 0;
        uint256 expired = 0;

        for (uint256 i = 1; i <= _tokenIdCounter.current(); i++) {
            if (_exists(i)) {
                Credential memory cred = credentials[i];
                if (revokedCredentials[i]) revoked++;
                if (cred.isSoulbound) soulbound++;
                if (isCredentialExpired(i)) expired++;
            }
        }

        return (_tokenIdCounter.current(), revoked, soulbound, expired);
    }
}
