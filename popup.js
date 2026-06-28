document.addEventListener('DOMContentLoaded', initializePopup);

const btnAdd = document.getElementById('btnAdd');
const accTokenInput = document.getElementById('accToken');
const accountList = document.getElementById('accountList');
const msgBox = document.getElementById('msgBox');

let currentActiveToken = null;

btnAdd.addEventListener('click', addAccount);

function showMessage(text, isError = false) {
  msgBox.textContent = text;
  msgBox.className = `message ${isError ? 'error' : 'success'}`;
  setTimeout(() => {
    msgBox.className = 'message';
  }, 4000);
}

async function initializePopup() {
  currentActiveToken = await getActiveTabToken();
  loadAccounts();
}

function loadAccounts() {
  chrome.storage.local.get({ accounts: [] }, (result) => {
    displayAccounts(result.accounts);
  });
}

function retrieveActiveToken() {
  try {
    return window.localStorage.getItem('token');
  } catch (e) {
    return null;
  }
}

function getActiveTabToken() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return resolve(null);
      const activeTab = tabs[0];
      const url = activeTab.url || '';

      if (!url.includes('discord.com')) {
        return resolve(null);
      }

      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: retrieveActiveToken
      }, (results) => {
        if (chrome.runtime.lastError || !results || !results[0]) {
          return resolve(null);
        }
        
        let rawToken = results[0].result;
        if (!rawToken) return resolve(null);

        resolve(rawToken.replace(/^"|"$/g, ''));
      });
    });
  });
}

function displayAccounts(accounts) {
  if (accounts.length === 0) {
    accountList.innerHTML = '<div class="empty-state">No accounts saved yet. Add one below!</div>';
    return;
  }

  accountList.innerHTML = '';
  accounts.forEach((acc, index) => {
    const card = document.createElement('div');
    card.className = 'account-card';

    const isActive = (currentActiveToken && acc.token === currentActiveToken);

    if (isActive) {
      card.style.borderColor = 'var(--success)';
      card.style.backgroundColor = 'rgba(35, 165, 90, 0.05)';
    }

    const accountLeft = document.createElement('div');
    accountLeft.style.display = 'flex';
    accountLeft.style.alignItems = 'center';
    accountLeft.style.gap = '10px';
    accountLeft.style.maxWidth = '70%';

    const avatar = document.createElement('img');
    avatar.src = acc.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
    avatar.style.width = '32px';
    avatar.style.height = '32px';
    avatar.style.borderRadius = '50%';
    avatar.style.backgroundColor = '#35363c';

    const info = document.createElement('div');
    info.className = 'account-info';
    info.style.overflow = 'hidden';

    const name = document.createElement('div');
    name.className = 'account-name';
    name.textContent = acc.label;

    const preview = document.createElement('div');
    preview.className = 'account-token-preview';
    const tok = acc.token || '';
    if (tok.length > 10) {
      preview.textContent = `${tok.substring(0, 6)}...${tok.substring(tok.length - 4)}`;
    } else {
      preview.textContent = '••••••••';
    }

    info.appendChild(name);
    info.appendChild(preview);

    accountLeft.appendChild(avatar);
    accountLeft.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'account-actions';

    const btnLogin = document.createElement('button');
    if (isActive) {
      btnLogin.className = 'btn-login';
      btnLogin.style.backgroundColor = 'var(--success)';
      btnLogin.style.cursor = 'default';
      btnLogin.textContent = 'Active';
    } else {
      btnLogin.className = 'btn-login';
      btnLogin.textContent = 'Login';
      btnLogin.addEventListener('click', () => loginToDiscord(acc.token));
    }

    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn-delete';
    btnDelete.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
    `;
    btnDelete.title = 'Delete Account';
    btnDelete.addEventListener('click', () => deleteAccount(index));

    actions.appendChild(btnLogin);
    actions.appendChild(btnDelete);

    card.appendChild(accountLeft);
    card.appendChild(actions);

    accountList.appendChild(card);
  });
}

async function addAccount() {
  const token = accTokenInput.value.trim();

  if (!token) {
    showMessage('Please paste a token.', true);
    return;
  }

  btnAdd.disabled = true;
  btnAdd.textContent = 'Fetching account...';

  try {
    const response = await fetch('https://discord.com/api/v9/users/@me', {
      headers: {
        'Authorization': token
      }
    });

    if (!response.ok) {
      throw new Error(response.status === 401 ? 'Invalid Discord token.' : 'Failed to fetch user profile.');
    }

    const userData = await response.json();

    const label = userData.global_name 
      ? `${userData.global_name} (${userData.username})` 
      : userData.username;

    let avatarUrl = '';
    if (userData.avatar) {
      avatarUrl = `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=64`;
    } else {
      try {
        const idNum = BigInt(userData.id);
        const fallbackIndex = Number((idNum >> 22n) % 6n);
        avatarUrl = `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
      } catch (e) {
        avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
      }
    }

    chrome.storage.local.get({ accounts: [] }, (result) => {
      const accounts = result.accounts;
      
      const exists = accounts.some(acc => acc.token === token);
      if (exists) {
        showMessage('This account token is already saved.', true);
        btnAdd.disabled = false;
        btnAdd.textContent = 'Add Account';
        return;
      }

      accounts.push({ label, token, avatarUrl });
      chrome.storage.local.set({ accounts }, () => {
        accTokenInput.value = '';
        btnAdd.disabled = false;
        btnAdd.textContent = 'Add Account';
        loadAccounts();
        showMessage(`Successfully added ${userData.username}!`);
      });
    });

  } catch (error) {
    showMessage(error.message || 'Error communicating with Discord API.', true);
    btnAdd.disabled = false;
    btnAdd.textContent = 'Add Account';
  }
}

function deleteAccount(index) {
  chrome.storage.local.get({ accounts: [] }, (result) => {
    const accounts = result.accounts;
    accounts.splice(index, 1);
    chrome.storage.local.set({ accounts }, () => {
      loadAccounts();
      showMessage('Account removed.');
    });
  });
}

function executeDiscordLogin(token) {
  try {
    window.localStorage.setItem('token', `"${token}"`);
    window.location.reload();
  } catch (e) {
    console.error('Error logging in:', e);
  }
}

function loginToDiscord(token) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      showMessage('No active tab found.', true);
      return;
    }

    const activeTab = tabs[0];
    const url = activeTab.url || '';

    if (!url.includes('discord.com')) {
      showMessage('Please navigate to discord.com first!', true);
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: executeDiscordLogin,
      args: [token]
    }, () => {
      if (chrome.runtime.lastError) {
        showMessage(`Error: ${chrome.runtime.lastError.message}`, true);
      } else {
        showMessage('Attempting to login. Page reloading...');
      }
    });
  });
}
