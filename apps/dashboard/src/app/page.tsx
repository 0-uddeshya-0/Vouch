export default function Home() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1>Vouch Dashboard</h1>
      <p>AI PR Analysis Dashboard - Coming Soon</p>
      
      <nav style={{ marginTop: '2rem' }}>
        <ul>
          <li><a href="/repos">Repositories</a></li>
          <li><a href="/findings">Security Findings</a></li>
          <li><a href="/settings">Settings</a></li>
        </ul>
      </nav>
    </main>
  );
}
