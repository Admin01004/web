/*
 * Token 관리자 페이지
 * Network: Polygon Mainnet (137) / Sepolia Testnet (11155111)
 * 보안 강화 및 에러 핸들링 개선 버전
 * 멀티 전송 기능 추가
 */

// ============================================================
//                    네트워크 설정
// ============================================================
let Network = 137; // 기본값: Polygon Mainnet

const NETWORKS = {
  "137": {
    name: "polygon",
    explorer: "https://polygonscan.com",
    chainName: "Polygon Mainnet",
    nativeCurrency: "POL",
    chainIdHex: "0x89",
    rpcUrls: ["https://polygon-rpc.com/"],
    blockExplorerUrls: ["https://polygonscan.com"],
    isTestnet: false
  },
  "11155111": {
    name: "sepolia",
    explorer: "https://sepolia.etherscan.io",
    chainName: "Sepolia Testnet",
    nativeCurrency: "ETH",
    chainIdHex: "0xaa36a7",
    rpcUrls: ["https://rpc.sepolia.org/"],
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
    isTestnet: true
  }
};

var WalletAddress = "";
var web3;
var ethersProvider;
var ethersSigner;

// ====== 유틸 함수 ======
function isValidEthereumAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function isValidAmount(amount, min = 0, max = 1000000000) {
  const num = Number(amount);
  return !isNaN(num) && num >= min && num <= max;
}

function isValidInteger(amount, min = 1, max = 1000000000) {
  const num = Number(amount);
  return !isNaN(num) && Number.isInteger(num) && num >= min && num <= max;
}

function fmtToken(bn) {
  try {
    return `${ethers.utils.formatEther(bn)} ETH`;
  } catch (_) {
    return "-";
  }
}

function fmtNative(bn) {
  try {
    const currency = getNetworkInfo().nativeCurrency;
    return `${ethers.utils.formatEther(bn)} ${currency}`;
  } catch (_) {
    return "-";
  }
}

// ====== 디바이스 감지 ======
function detectDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return "iOS";
  if (/android/i.test(ua)) return "Android";
  return "Desktop";
}

function redirectToMetaMask() {
  const device = detectDevice();
  if (device === "iOS") {
    window.location.href = "https://apps.apple.com/app/metamask/id1438144202";
  } else if (device === "Android") {
    window.location.href =
      "https://play.google.com/store/apps/details?id=io.metamask";
  } else {
    window.location.href = "https://metamask.io/download/";
  }
}

function openInMetaMaskBrowser() {
  const device = detectDevice();
  const currentUrl = window.location.href;
  if (device === "iOS" || device === "Android") {
    const metamaskDeepLink = `https://metamask.app.link/dapp/${currentUrl.replace(
      /^https?:\/\//,
      ""
    )}`;
    window.location.href = metamaskDeepLink;
    setTimeout(() => {
      redirectToMetaMask();
    }, 3000);
  } else {
    redirectToMetaMask();
  }
}

function rebuildProviders() {
  if (!window.ethereum) return;
  web3 = new Web3(window.ethereum);
  ethersProvider = new ethers.providers.Web3Provider(window.ethereum);
  ethersSigner = ethersProvider.getSigner();
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.innerText = v;
}

function getNetworkInfo() {
  return NETWORKS[Network.toString()] || NETWORKS["137"];
}

function getExplorerUrl() {
  return getNetworkInfo().explorer;
}

// ====== 에러 처리 (보안 강화) ======
function friendlyError(e) {
  try {
    if (
      e &&
      (e.code === 4001 ||
        e.code === "ACTION_REJECTED" ||
        (e.message || "").toLowerCase().includes("user rejected"))
    ) {
      return "트랜잭션을 취소하였습니다.";
    }

    const msg =
      e?.data?.message || e?.error?.message || e?.message || String(e);

    if (
      /timeout|timed out|could not detect network|missing response|failed to fetch|network request failed/i.test(
        msg
      )
    ) {
      return "RPC 서버 응답 대기 중 타임아웃이 발생했습니다.\n\n트랜잭션은 전송되었을 수 있으니 Explorer에서 확인해주세요.";
    }

    if (
      /Returned values aren't valid|did it run Out of Gas|not using the correct ABI|requesting data from a block number that does not exist|node which is not fully synced/i.test(
        msg
      )
    ) {
      return "현재 네트워크에서 컨트랙트를 찾을 수 없습니다. 네트워크와 컨트랙트 주소를 확인해주세요.";
    }

    if (/execution reverted|call exception|contract call failed/i.test(msg)) {
      const revertMatch = msg.match(
        /reverted with reason string ['"]([^'"]+)['"]/i
      );
      if (revertMatch) return `컨트랙트 실행 거부: ${revertMatch[1]}`;

      if (/NoLockupExists/i.test(msg)) return "락업이 존재하지 않습니다.";
      if (/LockupNotExpired/i.test(msg))
        return "락업이 아직 만료되지 않았습니다.";
      if (/LockupExpired/i.test(msg)) return "락업이 이미 만료되었습니다.";
      if (/OnlyDecrease/i.test(msg))
        return "현재 락업 수량보다 작은 값만 입력 가능합니다.";
      if (/AmountExceedsLocked/i.test(msg))
        return "해제할 수량이 현재 락업 수량보다 많습니다.";
      if (/InvalidLockupDuration/i.test(msg))
        return "유효하지 않은 락업 시간입니다.";
      if (/InsufficientBalance/i.test(msg)) return "잔액이 부족합니다.";
      if (/InsufficientUnlockedBalance/i.test(msg))
        return "잠금 해제된 잔액이 부족합니다.";
      if (/InvalidAmount/i.test(msg)) return "유효하지 않은 수량입니다.";
      if (/ZeroAddress/i.test(msg)) return "유효하지 않은 주소입니다.";
      if (/ZeroAmountInBatch/i.test(msg))
        return "수량이 0인 항목이 있습니다.";
      if (/EmptyRecipients/i.test(msg))
        return "수신자 목록이 비어있습니다.";
      if (/TooManyRecipients/i.test(msg))
        return "수신자가 너무 많습니다 (최대 300명).";
      if (/ArrayLengthMismatch/i.test(msg))
        return "주소와 수량의 개수가 일치하지 않습니다.";
      if (/EnforcedPause/i.test(msg)) return "컨트랙트가 일시정지 상태입니다.";

      return "컨트랙트 호출에 실패했습니다. 입력값과 권한을 확인해주세요.";
    }

    if (/insufficient funds/i.test(msg) || e?.code === "INSUFFICIENT_FUNDS") {
      const currency = getNetworkInfo().nativeCurrency;
      return `지갑 잔액(${currency})이 부족합니다. 가스비를 위한 ${currency}가 필요합니다.`;
    }

    if (/nonce too low/i.test(msg))
      return "논스가 낮습니다. 잠시 후 다시 시도해주세요.";
    if (/replacement (fee|underpriced)/i.test(msg))
      return "가스 가격/한도를 높여 재시도하세요.";

    if (
      e?.code === "UNPREDICTABLE_GAS_LIMIT" ||
      /gas required exceeds allowance|always failing transaction/i.test(msg)
    ) {
      return "가스 추정에 실패했습니다. 입력값, 권한, 컨트랙트 상태를 확인해주세요.";
    }

    if (/invalid address/i.test(msg)) return "잘못된 주소 형식입니다.";
    if (/invalid (bignumber|number|uint)/i.test(msg))
      return "숫자 형식이 올바르지 않습니다.";
    if (
      /network error|chain|wrong network|unsupported chain id/i.test(msg)
    )
      return "네트워크 오류입니다.";

    return "오류: " + msg;
  } catch (_) {
    return "알 수 없는 오류가 발생했습니다.";
  }
}

// ====== UI 상태 관리 ======
function updateUIState(isConnected) {
  const buttons = document.querySelectorAll(
    "button:not(.btn-connect-wallet):not(.network-btn)"
  );
  const links = document.querySelectorAll(".explorer-links a");
  const body = document.body;

  buttons.forEach((btn) => {
    btn.disabled = !isConnected;
    btn.style.cursor = isConnected ? "pointer" : "not-allowed";
    btn.style.opacity = isConnected ? "1" : "0.5";
  });

  links.forEach((link) => {
    link.style.pointerEvents = isConnected ? "auto" : "none";
    link.style.cursor = isConnected ? "pointer" : "not-allowed";
    link.style.opacity = isConnected ? "1" : "0.5";
  });

  if (isConnected) {
    body.classList.remove("wallet-not-connected");
  } else {
    body.classList.add("wallet-not-connected");
  }
}

async function ensureConnected() {
  if (!window.ethereum || !ethersProvider || !ethersSigner || !WalletAddress) {
    alert("지갑 연결 먼저 해주세요.");
    throw new Error("WALLET_NOT_CONNECTED");
  }
}

// ====== 네트워크 전환 ======
async function switchNetwork(targetChainId) {
  const networkInfo = NETWORKS[targetChainId.toString()];
  if (!networkInfo) {
    alert("지원하지 않는 네트워크입니다.");
    return false;
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: networkInfo.chainIdHex }]
    });
    return true;
  } catch (switchError) {
    if (switchError.code === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: networkInfo.chainIdHex,
              chainName: networkInfo.chainName,
              nativeCurrency: {
                name: networkInfo.nativeCurrency,
                symbol: networkInfo.nativeCurrency,
                decimals: 18
              },
              rpcUrls: networkInfo.rpcUrls,
              blockExplorerUrls: networkInfo.blockExplorerUrls
            }
          ]
        });
        return true;
      } catch (addError) {
        console.error("네트워크 추가 실패:", addError);
        return false;
      }
    } else if (switchError.code === 4001) {
      alert("네트워크 전환이 취소되었습니다.");
      return false;
    }
    throw switchError;
  }
}

async function selectNetwork(chainId) {
  Network = chainId;

  // smartcontract.js의 컨트랙트 주소 업데이트
  if (typeof updateContractAddress === "function") {
    updateContractAddress(chainId);
  }

  const networkInfo = getNetworkInfo();

  // 네트워크 버튼 UI 업데이트
  document.querySelectorAll(".network-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  const activeBtn = document.querySelector(
    `.network-btn[data-chain-id="${chainId}"]`
  );
  if (activeBtn) activeBtn.classList.add("active");

  // 네트워크 표시 업데이트
  const networkDisplay = document.getElementById("currentNetworkDisplay");
  if (networkDisplay) {
    networkDisplay.innerHTML = `
      <span style="font-weight:600;color:#00ffcc;">🌐 네트워크:</span>
      <span style="font-weight:700;color:#fff;">${networkInfo.chainName}</span>
      ${
        networkInfo.isTestnet
          ? '<span style="background:#ffc107;color:#000;padding:2px 6px;border-radius:4px;font-size:0.8em;margin-left:8px;">테스트넷</span>'
          : ""
      }
    `;
  }

  // Explorer 링크 업데이트
  setupExplorerLinks();

  // 지갑이 연결되어 있으면 네트워크 전환
  if (WalletAddress && window.ethereum) {
    const switched = await switchNetwork(chainId);
    if (switched) {
      rebuildProviders();
      await updateWalletInfo();
      await loadContractState();
    }
  }
}

// ====== 초기화 ======
async function initializeWeb3() {
  if (typeof window.ethereum === "undefined") {
    const device = detectDevice();
    const message =
      device === "Desktop"
        ? `MetaMask가 설치되지 않았습니다.\n\n확인을 누르면 MetaMask 설치 페이지로 이동합니다.`
        : `MetaMask가 설치되지 않았습니다.\n\n[확인] MetaMask 앱 다운로드\n[취소] MetaMask 브라우저에서 열기`;

    const userConfirm = confirm(message);
    if (userConfirm) {
      redirectToMetaMask();
    } else if (device !== "Desktop") {
      openInMetaMaskBrowser();
    }
    return false;
  }

  try {
    web3 = new Web3(window.ethereum);
    ethersProvider = new ethers.providers.Web3Provider(window.ethereum);
    ethersSigner = ethersProvider.getSigner();
    return true;
  } catch (e) {
    console.error("Web3 초기화 실패:", e);
    return false;
  }
}

function setupExplorerLinks() {
  if (typeof CONTRACT_ADDRESS === "undefined" || !CONTRACT_ADDRESS) return;

  const baseUrl = getExplorerUrl();
  const contractLink = document.getElementById("explorerContract");
  const tokenLink = document.getElementById("explorerTokenTracker");
  const holderLink = document.getElementById("explorerHoldAddress");

  if (contractLink) contractLink.href = `${baseUrl}/address/${CONTRACT_ADDRESS}`;
  if (tokenLink) tokenLink.href = `${baseUrl}/token/${CONTRACT_ADDRESS}`;
  if (holderLink)
    holderLink.href = `${baseUrl}/token/${CONTRACT_ADDRESS}#balances`;
}

async function checkAndSwitchNetwork() {
  try {
    if (!window.ethereum) return false;

    const currentChainId = await window.ethereum.request({
      method: "eth_chainId"
    });
    const targetChainIdHex = getNetworkInfo().chainIdHex;

    if (currentChainId !== targetChainIdHex) {
      console.log(
        `현재 네트워크: ${currentChainId}, 목표: ${targetChainIdHex}`
      );
      const switched = await switchNetwork(Network);
      if (!switched) return false;
    }

    rebuildProviders();
    setupExplorerLinks();
    return true;
  } catch (e) {
    console.error("네트워크 전환 실패:", e);
    alert("네트워크 전환에 실패했습니다.\n\n" + friendlyError(e));
    return false;
  }
}

// ====== 지갑 연결 ======
async function connectWallet() {
  const ok = await initializeWeb3();
  if (!ok) return;

  const switched = await checkAndSwitchNetwork();
  if (!switched) return;

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts"
  });
  if (!accounts || !accounts.length) {
    alert("지갑 연결 실패");
    return;
  }

  WalletAddress = accounts[0];
  document.getElementById("walletAddress").innerText = WalletAddress;
  updateUIState(true);

  const walletBtn = document.querySelector(".btn-connect-wallet");
  if (walletBtn) {
    walletBtn.innerText = "지갑 새로고침";
    walletBtn.onclick = refreshWallet;
  }

  await updateWalletInfo();
  await loadContractState();
  await Promise.allSettled([checkTokenBalance(), checkWalletRole()]);
}

async function refreshWallet() {
  await connectWallet();
}

async function updateWalletInfo() {
  await Promise.all([
    checkNativeBalance(),
    checkTokenBalance(),
    checkWalletRole()
  ]).catch(() => {});
}

async function checkNativeBalance() {
  try {
    const wei = await web3.eth.getBalance(WalletAddress);
    const bal = web3.utils.fromWei(wei, "ether");
    const currency = getNetworkInfo().nativeCurrency;
    document.getElementById(
      "walletBalance"
    ).innerText = `${parseFloat(bal).toFixed(4)} ${currency}`;
  } catch (e) {
    document.getElementById("walletBalance").innerText = "잔액 확인 실패";
  }
}

async function checkTokenBalance() {
  try {
    const c = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
    const bal = await c.methods.balanceOf(WalletAddress).call();
    const formatted = ethers.utils.formatEther(bal);
    document.getElementById(
      "tokenBalance"
    ).innerText = `${parseFloat(formatted).toFixed(2)} ETH(Custom)`;
  } catch (e) {
    document.getElementById("tokenBalance").innerText = "토큰 잔액 확인 실패";
  }
}

// ====== 권한 체크 ======
async function checkWalletRole() {
  try {
    const c = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
    const owner = await c.methods.owner().call();
    const isOwner = owner.toLowerCase() === WalletAddress.toLowerCase();

    const el = document.getElementById("walletRole");
    el.className = "wallet-role";
    if (isOwner) {
      el.innerText = "OWNER (관리자)";
      el.classList.add("admin");
    } else {
      el.innerText = "일반 사용자";
      el.classList.add("normal");
    }

    updateOwnerControls(isOwner);
  } catch (e) {
    document.getElementById("walletRole").innerText = "권한 확인 실패";
    updateOwnerControls(false);
  }
}

function updateOwnerControls(isOwner) {
  const ownerButtons = document.querySelectorAll(".owner-only");
  ownerButtons.forEach((btn) => {
    btn.disabled = !isOwner;
    btn.title = isOwner ? "" : "Owner 권한이 필요합니다.";
  });
}

// ====== Pause/Unpause ======
async function pauseToken() {
  await ensureConnected();
  try {
    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.pause();
    const tx = await c.pause({ gasLimit: gas.mul(120).div(100) });

    const explorerUrl = getExplorerUrl();

    try {
      await tx.wait();
      alert("✅ 토큰 일시정지 완료\n\n트랜잭션 해시: " + tx.hash);
    } catch (waitError) {
      alert(
        `⚠️ 트랜잭션 전송됨\n\n트랜잭션 해시: ${tx.hash}\n\n${explorerUrl}/tx/${tx.hash}`
      );
    }

    await loadContractState();
  } catch (e) {
    alert(friendlyError(e));
  }
}

async function unpauseToken() {
  await ensureConnected();
  try {
    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.unpause();
    const tx = await c.unpause({ gasLimit: gas.mul(120).div(100) });

    const explorerUrl = getExplorerUrl();

    try {
      await tx.wait();
      alert("✅ 토큰 정상화 완료\n\n트랜잭션 해시: " + tx.hash);
    } catch (waitError) {
      alert(
        `⚠️ 트랜잭션 전송됨\n\n트랜잭션 해시: ${tx.hash}\n\n${explorerUrl}/tx/${tx.hash}`
      );
    }

    await loadContractState();
  } catch (e) {
    alert(friendlyError(e));
  }
}

// ====== Lockup 관리 ======
async function setLockup() {
  await ensureConnected();
  try {
    const account = document.getElementById("lockupAccount").value.trim();
    const minutes = document.getElementById("lockupMinutes").value;
    const amount = document.getElementById("lockupAmount").value;

    if (!isValidEthereumAddress(account)) throw new Error("주소 형식 오류");
    if (!isValidInteger(minutes, 1))
      throw new Error("락업 시간은 1분 이상의 정수여야 합니다");
    if (!isValidAmount(amount, 0)) throw new Error("수량 오류");

    const amountWei = ethers.utils.parseEther(amount.toString());

    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.setLockup(account, minutes, amountWei);
    const tx = await c.setLockup(account, minutes, amountWei, {
      gasLimit: gas.mul(120).div(100)
    });

    const explorerUrl = getExplorerUrl();

    try {
      await tx.wait();
      alert(
        `✅ 락업 설정 완료\n\n주소: ${account}\n수량: ${amount} ETH(Custom)\n시간: ${minutes}분\n\n트랜잭션 해시: ${tx.hash}`
      );
    } catch (waitError) {
      alert(
        `⚠️ 트랜잭션 전송됨\n\n트랜잭션 해시: ${tx.hash}\n\n${explorerUrl}/tx/${tx.hash}`
      );
    }

    await loadContractState();
  } catch (e) {
    alert(friendlyError(e));
  }
}

async function extendLockup() {
  await ensureConnected();
  try {
    const account = document.getElementById("extendAccount").value.trim();
    const addMinutes = document.getElementById("extendMinutes").value;

    if (!isValidEthereumAddress(account)) throw new Error("주소 형식 오류");
    if (!isValidInteger(addMinutes, 1))
      throw new Error("연장 시간은 1분 이상의 정수여야 합니다");

    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.extendLockup(account, addMinutes);
    const tx = await c.extendLockup(account, addMinutes, {
      gasLimit: gas.mul(120).div(100)
    });

    const explorerUrl = getExplorerUrl();

    try {
      await tx.wait();
      alert(
        `✅ 락업 연장 완료\n\n주소: ${account}\n추가 시간: ${addMinutes}분\n\n트랜잭션 해시: ${tx.hash}`
      );
    } catch (waitError) {
      alert(
        `⚠️ 트랜잭션 전송됨\n\n트랜잭션 해시: ${tx.hash}\n\n${explorerUrl}/tx/${tx.hash}`
      );
    }

    await loadContractState();
  } catch (e) {
    alert(friendlyError(e));
  }
}

async function decreaseLockAmount() {
  await ensureConnected();
  try {
    const account = document.getElementById("decreaseAccount").value.trim();
    const newAmount = document.getElementById("decreaseAmount").value;

    if (!isValidEthereumAddress(account)) throw new Error("주소 형식 오류");
    if (!isValidAmount(newAmount, 0)) throw new Error("수량 오류");

    const amountWei = ethers.utils.parseEther(newAmount.toString());

    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.decreaseLockAmount(account, amountWei);
    const tx = await c.decreaseLockAmount(account, amountWei, {
      gasLimit: gas.mul(120).div(100)
    });

    const explorerUrl = getExplorerUrl();

    try {
      await tx.wait();
      alert(
        `✅ 락업 수량 감소 완료\n\n주소: ${account}\n새로운 락업 수량: ${newAmount} ETH(Custom)\n\n트랜잭션 해시: ${tx.hash}`
      );
    } catch (waitError) {
      alert(
        `⚠️ 트랜잭션 전송됨\n\n트랜잭션 해시: ${tx.hash}\n\n${explorerUrl}/tx/${tx.hash}`
      );
    }

    await loadContractState();
  } catch (e) {
    alert(friendlyError(e));
  }
}

async function releaseLockup() {
  await ensureConnected();
  try {
    const account = document.getElementById("releaseAccount").value.trim();
    const amount = document.getElementById("releaseAmount").value;

    if (!isValidEthereumAddress(account)) throw new Error("주소 형식 오류");
    if (!isValidAmount(amount, 0)) throw new Error("수량 오류");

    const amountWei = ethers.utils.parseEther(amount.toString());

    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.releaseLockup(account, amountWei);
    const tx = await c.releaseLockup(account, amountWei, {
      gasLimit: gas.mul(120).div(100)
    });

    const explorerUrl = getExplorerUrl();

    try {
      await tx.wait();
      alert(
        `✅ 락업 부분 해제 완료\n\n주소: ${account}\n해제된 수량: ${amount} ETH(Custom)\n\n트랜잭션 해시: ${tx.hash}`
      );
    } catch (waitError) {
      alert(
        `⚠️ 트랜잭션 전송됨\n\n트랜잭션 해시: ${tx.hash}\n\n${explorerUrl}/tx/${tx.hash}`
      );
    }

    await loadContractState();
  } catch (e) {
    alert(friendlyError(e));
  }
}

async function clearExpiredLockup() {
  await ensureConnected();
  try {
    const account = document.getElementById("clearAccount").value.trim();

    if (!isValidEthereumAddress(account)) throw new Error("주소 형식 오류");

    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.clearExpiredLockup(account);
    const tx = await c.clearExpiredLockup(account, {
      gasLimit: gas.mul(120).div(100)
    });

    const explorerUrl = getExplorerUrl();

    try {
      await tx.wait();
      alert(
        `✅ 만료된 락업 제거 완료\n\n주소: ${account}\n\n트랜잭션 해시: ${tx.hash}`
      );
    } catch (waitError) {
      alert(
        `⚠️ 트랜잭션 전송됨\n\n트랜잭션 해시: ${tx.hash}\n\n${explorerUrl}/tx/${tx.hash}`
      );
    }

    await loadContractState();
  } catch (e) {
    alert(friendlyError(e));
  }
}

// ====== Lockup 조회 ======
async function checkLockupInfo() {
  try {
    const account = document.getElementById("checkLockupAccount").value.trim();
    if (!isValidEthereumAddress(account)) throw new Error("주소 형식 오류");

    const c = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
    const info = await c.methods.lockedInfo(account).call();

    const locked = ethers.utils.formatEther(info.locked);
    const remainingSec = Number(info.remainingSeconds);
    const expiration = Number(info.expiration);

    if (Number(locked) === 0 || remainingSec === 0) {
      document.getElementById("lockupInfoResult").innerText =
        "❌ 락업 상태가 아닙니다.";
      document.getElementById("lockupInfoResult").style.borderColor = "#888";
      return;
    }

    const expirationDate = new Date(expiration * 1000);
    const now = new Date();

    const days = Math.floor(remainingSec / 86400);
    const hours = Math.floor((remainingSec % 86400) / 3600);
    const minutes = Math.floor((remainingSec % 3600) / 60);
    const seconds = remainingSec % 60;

    let timeStr = "";
    if (days > 0) timeStr += `${days}일 `;
    if (hours > 0) timeStr += `${hours}시간 `;
    if (minutes > 0) timeStr += `${minutes}분 `;
    timeStr += `${seconds}초`;

    document.getElementById("lockupInfoResult").innerText =
      `✅ 락업 정보\n\n` +
      `🔒 락업 수량: ${locked} ETH(Custom)\n` +
      `⏱ 남은 시간: ${timeStr}\n` +
      `📅 만료 일시: ${expirationDate.toLocaleString("ko-KR")}\n` +
      `🌐 현재 시간: ${now.toLocaleString("ko-KR")}`;

    document.getElementById("lockupInfoResult").style.borderColor = "#00ffcc";
  } catch (e) {
    document.getElementById("lockupInfoResult").innerText =
      "조회 실패: " + e.message;
    document.getElementById("lockupInfoResult").style.borderColor = "#ff6b6b";
  }
}

async function checkUnlockedBalance() {
  try {
    const account = document.getElementById("checkUnlockedAccount").value.trim();
    if (!isValidEthereumAddress(account)) throw new Error("주소 형식 오류");

    const c = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
    const unlocked = await c.methods.unlockedBalanceOf(account).call();
    const total = await c.methods.balanceOf(account).call();
    const locked = await c.methods.lockedBalance(account).call();

    document.getElementById("unlockedBalanceResult").innerText =
      `✅ 잔액 정보\n\n` +
      `💰 전체 보유: ${ethers.utils.formatEther(total)} ETH(Custom)\n` +
      `🔒 락업 중: ${ethers.utils.formatEther(locked)} ETH(Custom)\n` +
      `✅ 사용 가능: ${ethers.utils.formatEther(unlocked)} ETH(Custom)`;

    document.getElementById("unlockedBalanceResult").style.borderColor =
      "#00ffcc";
  } catch (e) {
    document.getElementById("unlockedBalanceResult").innerText =
      "조회 실패: " + e.message;
    document.getElementById("unlockedBalanceResult").style.borderColor =
      "#ff6b6b";
  }
}

// ====== 토큰 전송 ======
async function transferToken() {
  await ensureConnected();
  try {
    const to = document.getElementById("transferTo").value.trim();
    const amount = document.getElementById("transferAmount").value;

    if (!isValidEthereumAddress(to)) throw new Error("주소 형식 오류");
    if (!isValidAmount(amount, 0)) throw new Error("수량 오류");

    const amountWei = ethers.utils.parseEther(amount.toString());

    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.transfer(to, amountWei);
    const tx = await c.transfer(to, amountWei, {
      gasLimit: gas.mul(120).div(100)
    });

    const explorerUrl = getExplorerUrl();

    try {
      await tx.wait();
      alert(
        `✅ 전송 완료!\n\n받는 주소: ${to}\n전송 수량: ${amount} ETH(Custom)\n\n트랜잭션 해시: ${tx.hash}`
      );
    } catch (waitError) {
      alert(
        `⚠️ 트랜잭션 전송됨\n\n트랜잭션 해시: ${tx.hash}\n\n${explorerUrl}/tx/${tx.hash}`
      );
    }

    await updateWalletInfo();
  } catch (e) {
    alert(friendlyError(e));
  }
}

// ============================================================
//                    멀티 전송 기능 (동적 UI)
// ============================================================
let transferRows = 1;
const MAX_ROWS = 300;

function addTransferRow() {
  if (transferRows >= MAX_ROWS) {
    alert("최대 300개까지 가능합니다.");
    return;
  }
  transferRows++;
  renderTransferRows();
}

function removeTransferRow() {
  if (transferRows <= 1) return;
  transferRows--;
  renderTransferRows();
}

function generateBulkRows() {
  transferRows = MAX_ROWS;
  renderTransferRows();
}

function renderTransferRows() {
  const container = document.getElementById("multiTransferList");
  if (!container) return;
  container.innerHTML = "";

  for (let i = 1; i <= transferRows; i++) {
    const row = document.createElement("div");
    row.className = "transfer-row";
    row.style.display = "flex";
    row.style.gap = "10px";
    row.style.marginBottom = "8px";

    row.innerHTML = `
      <span style="width:30px;color:#00ffcc;font-weight:700;">${i}</span>
      <input
        type="text"
        placeholder="0x 지갑주소"
        class="form-input"
        id="addr_${i}"
      >
      <input
        type="number"
        placeholder="수량"
        class="form-input"
        id="amount_${i}"
        min="0"
        step="0.000001"
      >
    `;

    container.appendChild(row);
  }
}

// 초기 1줄 렌더링 (DOM 로드 이후)
setTimeout(renderTransferRows, 300);

/***************************************************************
 * 멀티 전송 미리보기 (동적 UI 전용)
 ***************************************************************/
function previewMultiTransferUI() {
  const recipients = [];
  const amounts = [];
  let total = 0;

  for (let i = 1; i <= transferRows; i++) {
    const addrEl = document.getElementById(`addr_${i}`);
    const amountEl = document.getElementById(`amount_${i}`);
    if (!addrEl || !amountEl) continue;

    const addr = addrEl.value.trim();
    const amountStr = amountEl.value.trim();

    // 완전 빈 줄은 스킵
    if (!addr && !amountStr) continue;

    if (!isValidEthereumAddress(addr)) {
      alert(`${i}번 줄 주소가 유효하지 않습니다.`);
      return null;
    }

    if (!isValidAmount(amountStr, 0.000001)) {
      alert(`${i}번 줄 수량이 유효하지 않습니다.`);
      return null;
    }

    const numAmount = Number(amountStr);

    recipients.push(addr);
    amounts.push(amountStr);
    total += numAmount;
  }

  const previewBox = document.getElementById("multiTransferPreview");
  if (!previewBox) return null;

  if (recipients.length === 0) {
    previewBox.innerHTML =
      '<span style="color:#888;">입력된 데이터가 없습니다.</span>';
    previewBox.style.borderColor = "#888";
    return null;
  }

  if (recipients.length > MAX_ROWS) {
    previewBox.innerHTML = `<span style="color:#ff6b6b;">❌ 수신자가 너무 많습니다 (${recipients.length}명 / 최대 ${MAX_ROWS}명)</span>`;
    previewBox.style.borderColor = "#ff6b6b";
    return null;
  }

  let preview = `✅ 멀티 전송 미리보기\n\n`;
  preview += `📊 총 수신자: ${recipients.length}명\n`;
  preview += `💰 총 전송량: ${total.toFixed(4)} ETH(Custom)\n\n`;
  preview += `📋 상세 내역:\n`;

  recipients.forEach((addr, i) => {
    const shortAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    preview += `  ${i + 1}. ${shortAddr} → ${amounts[i]} ETH(Custom)\n`;
  });

  previewBox.innerText = preview;
  previewBox.style.borderColor = "#00ffcc";

  return { recipients, amounts, total };
}

/***************************************************************
 * 실제 멀티 전송 실행 (동적 UI 전용)
 ***************************************************************/
async function executeMultiTransferUI() {
  await ensureConnected();

  const previewData = previewMultiTransferUI();
  if (!previewData) {
    alert("입력 데이터를 먼저 확인해주세요.");
    return;
  }

  const { recipients, amounts, total } = previewData;

  const confirmed = confirm(
    `멀티 전송을 실행하시겠습니까?\n\n` +
      `총 수신자: ${recipients.length}명\n` +
      `총 전송량: ${total.toFixed(4)} ETH(Custom)\n\n` +
      `⚠️ 이 작업은 취소할 수 없습니다.`
  );

  if (!confirmed) return;

  try {
    const amountsWei = amounts.map((amt) =>
      ethers.utils.parseEther(amt.toString())
    );

    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);

    const gas = await c.estimateGas.multiTransfer(recipients, amountsWei);
    const gasLimit = gas.mul(130).div(100); // 30% 여유

    const tx = await c.multiTransfer(recipients, amountsWei, { gasLimit });

    const explorerUrl = getExplorerUrl();
    const previewBox = document.getElementById("multiTransferPreview");

    if (previewBox) {
      previewBox.innerHTML =
        `⏳ 트랜잭션 처리 중...\n\n해시: ${tx.hash}\n\n${explorerUrl}/tx/${tx.hash}`;
      previewBox.style.borderColor = "#00ffcc";
    }

    try {
      const receipt = await tx.wait();

      if (previewBox) {
        previewBox.innerHTML =
          `✅ 멀티 전송 완료!\n\n` +
          `총 수신자: ${recipients.length}명\n` +
          `총 전송량: ${total.toFixed(4)} ETH(Custom)\n` +
          `가스 사용: ${receipt.gasUsed.toString()}\n\n` +
          `트랜잭션 해시: ${tx.hash}`;
        previewBox.style.borderColor = "#00ffcc";
      }

      alert(
        `✅ 멀티 전송 완료!\n\n${recipients.length}명에게 ${total.toFixed(
          4
        )} ETH(Custom) 전송됨`
      );
    } catch (waitError) {
      alert(`⚠️ 트랜잭션 전송됨\n\n확인: ${explorerUrl}/tx/${tx.hash}`);
    }

    await updateWalletInfo();
  } catch (e) {
    console.error("멀티 전송 에러:", e);
    const previewBox = document.getElementById("multiTransferPreview");
    if (previewBox) {
      previewBox.innerHTML = `<span style="color:#ff6b6b;">❌ 전송 실패: ${friendlyError(
        e
      )}</span>`;
      previewBox.style.borderColor = "#ff6b6b";
    }
    alert(friendlyError(e));
  }
}

/***************************************************************
 * 줄 개수 숫자로 직접 설정
 ***************************************************************/
function setRowsByNumber() {
  const input = document.getElementById("rowCountInput").value.trim();

  if (!input) {
    alert("줄 개수를 입력해주세요.");
    return;
  }

  const num = Number(input);
  if (isNaN(num) || num < 1 || num > MAX_ROWS) {
    alert("1 ~ 300 사이의 숫자를 입력해주세요.");
    return;
  }

  transferRows = num;
  renderTransferRows();
  alert(`${num}개의 입력 줄이 생성되었습니다.`);
}

// ====== 토큰 소각 ======
async function burnToken() {
  await ensureConnected();
  try {
    const amount = document.getElementById("burnAmount").value;

    if (!isValidAmount(amount, 0)) throw new Error("수량 오류");

    const amountWei = ethers.utils.parseEther(amount.toString());

    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.burn(amountWei);
    const tx = await c.burn(amountWei, {
      gasLimit: gas.mul(120).div(100)
    });

    const explorerUrl = getExplorerUrl();

    try {
      await tx.wait();
      alert(
        `✅ 소각 완료!\n\n소각된 수량: ${amount} ETH(Custom)\n\n트랜잭션 해시: ${tx.hash}`
      );
    } catch (waitError) {
      alert(
        `⚠️ 트랜잭션 전송됨\n\n트랜잭션 해시: ${tx.hash}\n\n${explorerUrl}/tx/${tx.hash}`
      );
    }

    await updateWalletInfo();
    await loadContractState();
  } catch (e) {
    alert(friendlyError(e));
  }
}

// ====== 토큰 정보 조회 ======
async function checkBalance() {
  try {
    const account = document
      .getElementById("checkBalanceAccount")
      .value.trim();
    if (!isValidEthereumAddress(account)) throw new Error("주소 형식 오류");

    const c = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
    const bal = await c.methods.balanceOf(account).call();
    const formatted = ethers.utils.formatEther(bal);

    document.getElementById("balanceResult").innerText =
      `💰 전체 잔액: ${formatted} ETH(Custom)\n\n` +
      `💡 이 중 일부는 락업되어 있을 수 있습니다.`;

    document.getElementById("balanceResult").style.borderColor = "#00ffcc";
  } catch (e) {
    document.getElementById("balanceResult").innerText =
      "조회 실패: " + e.message;
    document.getElementById("balanceResult").style.borderColor = "#ff6b6b";
  }
}

// ====== 컨트랙트 상태 조회 ======
async function loadContractState() {
  if (!WalletAddress || !ethersSigner) return;

  try {
    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const wc = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);

    const [name, symbol, decimals, totalSupply, paused, owner] =
      await Promise.all([
        c.name(),
        c.symbol(),
        c.decimals(),
        wc.methods.totalSupply().call(),
        c.paused(),
        c.owner()
      ]);

    setText("st_name", name);
    setText("st_symbol", symbol);
    setText("st_decimals", decimals.toString());
    setText(
      "st_totalSupply",
      ethers.utils.formatEther(totalSupply) + " ETH(Custom)"
    );
    setText("st_paused", paused ? "일시정지 상태" : "정상");
    setText("st_owner", owner);
  } catch (e) {
    console.error("컨트랙트 상태 조회 오류:", e);
  }
}

// ====== 초기 DOM 세팅 ======
document.addEventListener("DOMContentLoaded", async () => {
  // MetaMask 미설치 경고
  if (typeof window.ethereum === "undefined") {
    const device = detectDevice();
    const walletSection = document.querySelector(".wallet-section");
    if (walletSection) {
      const warningDiv = document.createElement("div");
      warningDiv.style.cssText = `
        background: rgba(255,107,107,0.1);
        border: 2px solid #ff6b6b;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 15px;
        text-align: center;
      `;

      let buttonText =
        device === "iOS"
          ? "App Store에서 MetaMask 다운로드"
          : device === "Android"
          ? "Play Store에서 MetaMask 다운로드"
          : "MetaMask 설치하기";

      warningDiv.innerHTML = `
        <h3 style="color:#ff6b6b;margin:0 0 10px 0;">⚠️ MetaMask가 설치되지 않았습니다</h3>
        <p style="margin:10px 0;">이 dApp을 사용하려면 MetaMask가 필요합니다.</p>
        <button onclick="redirectToMetaMask()" style="background:#f09433;color:white;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;margin:5px;">
          🦊 ${buttonText}
        </button>
        ${
          device !== "Desktop"
            ? `
          <button onclick="openInMetaMaskBrowser()" style="background:#00d395;color:white;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;margin:5px;">
            🌐 MetaMask 브라우저로 열기
          </button>
        `
            : ""
        }
      `;

      walletSection.insertBefore(warningDiv, walletSection.firstChild);
    }
  }

  updateUIState(false);

  // 기본 네트워크 버튼 활성화
  const defaultBtn = document.querySelector('.network-btn[data-chain-id="137"]');
  if (defaultBtn) defaultBtn.classList.add("active");

  // 네트워크 변경 감지
  if (window.ethereum) {
    window.ethereum.on("chainChanged", async (chainId) => {
      const decimalChainId = parseInt(chainId, 16);

      if (NETWORKS[decimalChainId.toString()]) {
        Network = decimalChainId;

        document.querySelectorAll(".network-btn").forEach((btn) => {
          btn.classList.remove("active");
        });
        const activeBtn = document.querySelector(
          `.network-btn[data-chain-id="${decimalChainId}"]`
        );
        if (activeBtn) activeBtn.classList.add("active");

        if (typeof updateContractAddress === "function") {
          updateContractAddress(decimalChainId);
        }

        rebuildProviders();
        setupExplorerLinks();

        if (WalletAddress) {
          await updateWalletInfo();
          await loadContractState();
        }
      }
    });

    window.ethereum.on("accountsChanged", async (accounts) => {
      if (accounts.length === 0) {
        WalletAddress = "";
        document.getElementById("walletAddress").innerText = "연결되지 않음";
        updateUIState(false);

        const walletBtn = document.querySelector(".btn-connect-wallet");
        if (walletBtn) {
          walletBtn.innerText = "🔗 지갑 연결 (MetaMask)";
          walletBtn.onclick = connectWallet;
        }
      } else if (accounts[0] !== WalletAddress) {
        WalletAddress = accounts[0];
        document.getElementById("walletAddress").innerText = WalletAddress;
        await updateWalletInfo();
        await loadContractState();
      }
    });
  }
});

// ====== 토큰 추가 ======
const TOKEN = {
  address:
    typeof CONTRACT_ADDRESS !== "undefined" ? CONTRACT_ADDRESS.trim() : "",
  symbol: "ETH",
  decimals: 18
};

const TOKEN_LOGO_CANDIDATES = [
  (typeof window !== "undefined" && window.__TOKEN_LOGO_URL__) || null,
  new URL("/logo.png", window.location.origin).toString()
].filter(Boolean);

async function addCustomToken() {
  try {
    if (typeof window.ethereum === "undefined") {
      alert("MetaMask가 설치되지 않았습니다.");
      return;
    }

    await checkAndSwitchNetwork();

    const wasAdded = await window.ethereum.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: CONTRACT_ADDRESS,
          symbol: "ETH",
          decimals: 18,
          image: TOKEN_LOGO_CANDIDATES[0] || undefined
        }
      }
    });

    if (wasAdded) {
      alert("✅ 토큰이 지갑에 추가되었습니다.");
    }
  } catch (e) {
    alert("토큰 추가 실패: " + friendlyError(e));
  }
}

