export default function LoginPage() {


  return (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <h1>Login</h1>

      <form method="POST" action="/auth/login" style={{ display: "grid", gap: 12 }}>
        <label>
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <button type="submit" style={{ padding: 10 }}>
          Sign in
        </button>
      </form>
    </div>
  );
}
