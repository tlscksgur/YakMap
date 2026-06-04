export function getAuthErrorMessage(mode, errorMessage) {
  const message = String(errorMessage || "").toLowerCase();

  if (message.includes("rate limit")) {
    return "이메일 인증 요청이 너무 많습니다. 잠시 후 다시 시도하세요.";
  }

  if (mode === "signup" && (
    message.includes("already registered")
    || message.includes("user already")
    || message.includes("already exists")
    || message.includes("already been registered")
  )) {
    return "이미 가입된 이메일입니다.";
  }

  if (message.includes("email address") && message.includes("invalid")) {
    return "사용할 수 없는 이메일 주소입니다.";
  }

  if (message.includes("email not confirmed")) {
    return "Supabase 이메일 확인이 필요합니다. 앱 인증코드로 계정을 복구하세요.";
  }

  if (message.includes("password") || message.includes("invalid") || message.includes("credential")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다";
  }

  return "";
}
