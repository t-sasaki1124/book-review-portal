const awsmobile = window.awsmobile;
const amplifyNamespace =
  window.aws_amplify ||
  window.Amplify ||
  window.amplify ||
  null;
const amplifyCore = amplifyNamespace?.Amplify || amplifyNamespace || null;
const Auth = amplifyNamespace?.Auth || amplifyCore?.Auth || null;

if (amplifyCore?.configure && awsmobile) {
  amplifyCore.configure(awsmobile);
}

const authMode = document.body?.dataset?.authMode || "signin";
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authSignIn = document.getElementById("authSignIn");
const authSignUp = document.getElementById("authSignUp");
const authConfirm = document.getElementById("authConfirm");
const authConfirmCode = document.getElementById("authConfirmCode");
const authMessage = document.getElementById("authMessage");

const formatAuthError = (error) => {
  const code = error?.code || "";
  const message = error?.message || "";
  if (code === "UserNotFoundException") {
    return "アカウントが見つかりませんでした。";
  }
  if (code === "NotAuthorizedException") {
    return "メールアドレスまたはパスワードが間違っています。";
  }
  if (code === "UsernameExistsException") {
    return "このメールアドレスは既に登録されています。";
  }
  if (code === "InvalidPasswordException") {
    return "パスワードの形式が要件を満たしていません。";
  }
  if (code === "CodeMismatchException") {
    return "確認コードが正しくありません。";
  }
  if (code === "ExpiredCodeException") {
    return "確認コードの有効期限が切れています。";
  }
  if (code === "LimitExceededException" || code === "TooManyRequestsException") {
    return "試行回数が多すぎます。しばらくしてから再試行してください。";
  }
  if (message) {
    return message;
  }
  return "処理に失敗しました。";
};

const setMessage = (message, isError = false) => {
  if (!authMessage) return;
  authMessage.textContent = message;
  authMessage.classList.toggle("is-error", isError);
};

if (!awsmobile) {
  setMessage("設定の読み込みに失敗しました。", true);
} else if (!Auth) {
  setMessage("認証の初期化に失敗しました。", true);
}

const params = new URLSearchParams(window.location.search);
if (authMode === "signin" && params.get("confirmed") === "1") {
  setMessage("確認が完了しました。ログインしてください。");
}

if (authSignIn) {
  authSignIn.addEventListener("click", async () => {
    if (!Auth) return;
    const email = authEmail?.value.trim();
    const password = authPassword?.value || "";
    if (!email || !password) {
      setMessage("メールとパスワードを入力してください。", true);
      return;
    }
    try {
      await Auth.signIn(email, password);
      setMessage("ログインしました。");
      window.location.href = "index.html";
    } catch (error) {
      setMessage(`ログインに失敗しました。${formatAuthError(error)}`, true);
    }
  });
}

if (authSignUp) {
  authSignUp.addEventListener("click", async () => {
    if (!Auth) return;
    const email = authEmail?.value.trim();
    const rawPassword = authPassword?.value || "";
    const password = rawPassword.trim();
    if (rawPassword !== password) {
      setMessage("パスワードの前後に空白があります。空白を削除してください。", true);
      return;
    }
    if (!email || !password) {
      setMessage("メールとパスワードを入力してください。", true);
      return;
    }
    try {
      await Auth.signUp({
        username: email,
        password,
        attributes: { email },
      });
      setMessage("認証コードを送信しました。コードを入力してください。");
    } catch (error) {
      setMessage(`送信に失敗しました。${formatAuthError(error)}`, true);
    }
  });
}

if (authConfirm) {
  authConfirm.addEventListener("click", async () => {
    if (!Auth) return;
    const email = authEmail?.value.trim();
    const code = authConfirmCode?.value.trim();
    if (!email || !code) {
      setMessage("メールと確認コードを入力してください。", true);
      return;
    }
    try {
      await Auth.confirmSignUp(email, code);
      window.location.href = "login.html?confirmed=1";
    } catch (error) {
      setMessage(`確認に失敗しました。${formatAuthError(error)}`, true);
    }
  });
}
