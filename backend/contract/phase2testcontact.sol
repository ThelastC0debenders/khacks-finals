// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TimeLockHoneypot
 * @notice A test contract demonstrating time-based honeypot patterns
 * @dev This contract is for TESTING ONLY - demonstrates scam detection
 *
 * Features:
 * - Trading only enabled for first 7 days
 * - Owner can always trade
 * - Demonstrates delayed honeypot activation
 */
contract TimeLockHoneypot {
    string public name = "TimeLock Scam Token";
    string public symbol = "TLOCK";
    uint8 public decimals = 18;
    uint256 public totalSupply = 1000000 * 10**18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public owner;
    uint256 public deploymentTime;
    uint256 public tradingWindow = 7 days;
    bool public tradingEnabled = true;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        owner = msg.sender;
        deploymentTime = block.timestamp;
        balanceOf[msg.sender] = totalSupply;
    }

    // Allow easy testing via "Send ETH"
    receive() external payable {
        _checkTradingAllowed(msg.sender);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /**
     * @dev Time-based check - trading closes after 7 days
     */
    function _checkTradingAllowed(address from) internal view {
        // Owner can always trade
        if (from == owner) return;

        // Time bomb: trading disabled after window expires
        require(block.timestamp < deploymentTime + tradingWindow, "Trading window closed");
        require(tradingEnabled, "Trading disabled");
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _checkTradingAllowed(msg.sender);
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");

        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        _checkTradingAllowed(from);
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");

        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    // Owner functions
    function setTradingWindow(uint256 _window) external onlyOwner {
        tradingWindow = _window;
    }

    function enableTrading(bool _enabled) external onlyOwner {
        tradingEnabled = _enabled;
    }

    // Rug pull function
    function drain() external onlyOwner {
        balanceOf[owner] = totalSupply;
    }
}


/**
 * @title WhitelistHoneypot
 * @notice A test contract demonstrating whitelist-based honeypot
 * @dev Only whitelisted addresses can sell - classic honeypot pattern
 */
contract WhitelistHoneypot {
    string public name = "Whitelist Scam Token";
    string public symbol = "WLIST";
    uint8 public decimals = 18;
    uint256 public totalSupply = 1000000 * 10**18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public isWhitelisted;
    mapping(address => bool) public isBlacklisted;

    address public owner;
    bool public whitelistMode = true; // When true, only whitelisted can sell

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        owner = msg.sender;
        balanceOf[msg.sender] = totalSupply;
        isWhitelisted[msg.sender] = true;
    }

    // Allow easy testing via "Send ETH"
    receive() external payable {
        _checkTransferAllowed(msg.sender);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /**
     * @dev Whitelist check - only whitelisted addresses can transfer
     */
    function _checkTransferAllowed(address from) internal view {
        require(!isBlacklisted[from], "Address blacklisted");

        // In whitelist mode, only whitelisted can sell
        if (whitelistMode) {
            require(isWhitelisted[from] || from == owner, "Not whitelisted");
        }
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _checkTransferAllowed(msg.sender);
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");

        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        _checkTransferAllowed(from);
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");

        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    // Owner functions
    function addWhitelist(address _addr) external onlyOwner {
        isWhitelisted[_addr] = true;
    }

    function removeWhitelist(address _addr) external onlyOwner {
        isWhitelisted[_addr] = false;
    }

    function blacklist(address _addr) external onlyOwner {
        isBlacklisted[_addr] = true;
    }

    function setWhitelistMode(bool _mode) external onlyOwner {
        whitelistMode = _mode;
    }

    // Rug pull
    function drain() external onlyOwner {
        balanceOf[owner] = totalSupply;
    }
}


/**
 * @title DelayedTradingToken
 * @notice A test contract demonstrating delayed trading (future unlock)
 * @dev Trading opens 24 hours after deployment
 */
contract DelayedTradingToken {
    string public name = "Delayed Trading Token";
    string public symbol = "DELAY";
    uint8 public decimals = 18;
    uint256 public totalSupply = 1000000 * 10**18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public owner;
    uint256 public tradingStartTime;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        owner = msg.sender;
        // Trading opens 24 hours from now
        tradingStartTime = block.timestamp + 24 hours;
        balanceOf[msg.sender] = totalSupply;
    }

    // Allow easy testing via "Send ETH"
    receive() external payable {
        _checkTradingOpen(msg.sender);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function _checkTradingOpen(address from) internal view {
        // Owner can always trade
        if (from == owner) return;

        require(block.timestamp >= tradingStartTime, "Trading not open yet");
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _checkTradingOpen(msg.sender);
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");

        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        _checkTradingOpen(from);
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");

        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    // Owner can extend delay
    function setTradingStartTime(uint256 _time) external onlyOwner {
        tradingStartTime = _time;
    }
}
