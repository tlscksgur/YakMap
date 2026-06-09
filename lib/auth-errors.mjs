export function getAuthErrorMessage(mode, errorMessage) {
  const message = String(errorMessage || "").toLowerCase();

  if (message.includes("rate limit")) {
    return "이메일 인증 요청이 너무 많습니다. 잠시 후 다시 시도하세요.";
  }

  if (message.includes("인증코드를 먼저") || message.includes("verification code first")) {
    return "인증코드를 다시 이메일로 받아야 합니다. 인증코드 발송 버튼을 다시 눌러주세요.";
  }

  if (message.includes("인증코드가 만료") || message.includes("verification code expired")) {
    return "인증코드가 만료되었습니다. 다시 요청하세요.";
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
