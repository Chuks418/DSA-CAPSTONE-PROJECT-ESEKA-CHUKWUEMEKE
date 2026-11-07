
import { login, signup } from '../api.js';
import { setSession } from '../session.js';

const loginSection = document.querySelector('#login-section');
const signupSection = document.querySelector('#signup-section');

const loginForm = document.querySelector('#login-form');
const signupForm = document.querySelector('#signup-form');

const loginButton = document.querySelector('#login-button');
const signupButton = document.querySelector('#signup-button');

const showLoginButton = document.querySelector('#show-login');
const showSignupButton = document.querySelector('#show-signup');

const authMessage = document.querySelector('#auth-message');

const params = new URLSearchParams(window.location.search);

function getRedirectPath(user) {
  const returnTo = params.get('returnTo');

  if (
    returnTo &&
    returnTo.startsWith('/') &&
    !returnTo.startsWith('//')
  ) {
    return returnTo;
  }

  return user.role === 'organizer'
    ? '/organizer.html'
    : '/tickets.html';
}

function showMessage(message, isError = true) {
  authMessage.textContent = message;
  authMessage.className = isError
    ? 'message message-error'
    : 'message message-success';
  authMessage.hidden = false;
}

function clearMessage() {
  authMessage.hidden = true;
  authMessage.textContent = '';
}

function showLogin() {
  loginSection.hidden = false;
  signupSection.hidden = true;

  showLoginButton.className = 'button button-primary';
  showSignupButton.className = 'button button-secondary';

  clearMessage();
}

function showSignup() {
  loginSection.hidden = true;
  signupSection.hidden = false;

  showLoginButton.className = 'button button-secondary';
  showSignupButton.className = 'button button-primary';

  clearMessage();
}

async function completeAuthentication(result) {
  setSession(result);

  showMessage('Authentication successful. Redirecting...', false);

  window.location.href = getRedirectPath(result.user);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage();

  loginButton.disabled = true;
  loginButton.textContent = 'Signing in...';

  const formData = new FormData(loginForm);

  try {
    const result = await login({
      email: String(formData.get('email')).trim(),
      password: String(formData.get('password')),
    });

    await completeAuthentication(result);
  } catch (error) {
    showMessage(error.message || 'Unable to sign in. Please try again.');
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = 'Sign in';
  }
});

signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage();

  signupButton.disabled = true;
  signupButton.textContent = 'Creating account...';

  const formData = new FormData(signupForm);

  try {
    const result = await signup({
      email: String(formData.get('email')).trim(),
      password: String(formData.get('password')),
      role: String(formData.get('role')),
    });

    await completeAuthentication(result);
  } catch (error) {
    showMessage(error.message || 'Unable to create account. Please try again.');
  } finally {
    signupButton.disabled = false;
    signupButton.textContent = 'Create account';
  }
});

showLoginButton.addEventListener('click', showLogin);
showSignupButton.addEventListener('click', showSignup);

if (params.get('mode') === 'signup') {
  showSignup();
} else {
  showLogin();
}
