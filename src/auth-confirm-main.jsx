import{useEffect}from'react';
function App(){useEffect(()=>{window.location.replace('/account-verification.html'+window.location.search+window.location.hash)},[]);return <main style={{fontFamily:'Arial,sans-serif',padding:'48px',textAlign:'center'}}>Opening secure account verification…</main>}
export default App;