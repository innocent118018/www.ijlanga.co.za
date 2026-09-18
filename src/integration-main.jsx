import React from 'react';
import {createRoot} from 'react-dom/client';
import {Activity,CheckCircle2,Code2,Database,Globe,MessageCircle,ShieldCheck,Webhook} from 'lucide-react';
import {supabase} from './lib/supabase';
import './integration-hub.css';

const providers=[
['iKhokha / iK Pay','Payments','Node.js adapter + signed webhook','Ready'],
['Payfast','Payments','Node.js adapter + ITN','Ready'],
['CIPC APIVerse','Compliance','Node.js OAuth 2 REST adapter','Credentials required'],
['Manager.io','Accounting','Node.js API adapter','Credentials required'],
['Google Business Profile','Reviews','Node.js OAuth adapter','Credentials required'],
['WhatsApp Cloud API','Messaging','Node.js Graph adapter','Credentials required'],
['Meta / Facebook Graph','Messaging / Leads','Node.js Graph adapter','Credentials required'],
['GraphQL','Internal API','Node.js GraphQL boundary','Prototype'],
['Webhooks','Event processing','Node.js signed event gateway','Prototype']
];

function App(){
 const [session,setSession]=React.useState(null); const [profile,setProfile]=React.useState(null);
 React.useEffect(()=>{supabase.auth.getSession().then(async({data})=>{setSession(data.session);if(data.session){const {data:p}=await supabase.from('profiles').select('role,is_active').eq('id',data.session.user.id).maybeSingle();setProfile(p)}})},[]);
 if(!session||profile?.role!=='admin'||profile?.is_active===false)return <main className="integration-gate"><h2>Administrator access required</h2><a href="/admin.html">Return to admin</a></main>;
 return <main className="integration-page"><header className="integration-hero"><div><span>IJ LANGA CONSULTING · INTEGRATION HUB</span><h1>Connected services, one control plane.</h1><p>Node.js is the main integration layer. Rust and Kotlin clients use the same controlled API without receiving provider secrets.</p></div><div className="integration-health"><Activity size={20}/><b>3</b><small>Prototype-ready areas</small></div></header><section className="integration-grid">{providers.map(([name,cat,stack,state])=><article className="integration-card" key={name}><div className="integration-icon">{cat==='Payments'?<Database size={18}/>:cat==='Messaging / Leads'?<MessageCircle size={18}/>:cat==='Event processing'?<Webhook size={18}/>:<Globe size={18}/>}</div><span>{cat}</span><h2>{name}</h2><p>{stack}</p><strong className={state==='Ready'?'ready':''}>{state==='Ready'?<CheckCircle2 size={14}/>:<ShieldCheck size={14}/>} {state}</strong></article>)}</section><section className="integration-prototype"><span>SDK PROTOTYPE</span><h2>Node.js · Rust · Kotlin</h2><p>Node.js handles provider orchestration. Rust provides typed worker clients. Kotlin provides Android/JVM clients.</p><div className="runtime-row"><div><Code2/><b>Node.js</b><small>Primary adapters</small></div><div><ShieldCheck/><b>Rust</b><small>Typed workers</small></div><div><Globe/><b>Kotlin</b><small>Android / JVM</small></div></div></section></main>
}
createRoot(document.getElementById('root')).render(<App/>);
