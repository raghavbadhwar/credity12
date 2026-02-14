import { FormEvent, useState } from 'react';
import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import Marquee from 'react-fast-marquee';
import Tilt from 'react-parallax-tilt';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Blocks,
  BookCheck,
  Building2,
  CalendarRange,
  CheckCircle2,
  FileBadge2,
  Globe2,
  Landmark,
  Lock,
  Mail,
  Radar,
  ShieldCheck,
  Sparkles,
  Wallet,
  Workflow,
} from 'lucide-react';
import './App.css';

const PORTAL_URLS = {
  issuer: import.meta.env.VITE_ISSUER_URL || 'http://localhost:5001',
  wallet: import.meta.env.VITE_WALLET_URL || 'http://localhost:5002',
  recruiter: import.meta.env.VITE_RECRUITER_URL || 'http://localhost:5003',
};

const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL || 'hello@credverse.app';

const metrics = [
  { end: 4, label: 'Integrated Products', suffix: '' },
  { end: 3, label: 'Core Personas (Issuer / Holder / Recruiter)', suffix: '' },
  { end: 2, label: 'Proof Lanes (On-chain + ZK-ready)', suffix: '' },
  { end: 1, label: 'Unified Gateway Experience', suffix: '' },
];

const ecosystemCards: Array<{
  title: string;
  subtitle: string;
  description: string;
  icon: LucideIcon;
  href: string;
}> = [
  {
    title: 'CredVerse Issuer',
    subtitle: 'Institution Command Center',
    description:
      'Issue standards-compliant credentials, manage templates, and anchor verifiable proofs.',
    icon: Building2,
    href: PORTAL_URLS.issuer,
  },
  {
    title: 'BlockWallet Digi',
    subtitle: 'User Sovereignty Engine',
    description:
      'Claim, hold, and share credentials with holder-first controls and consent-aware workflows.',
    icon: Wallet,
    href: PORTAL_URLS.wallet,
  },
  {
    title: 'CredVerse Recruiter',
    subtitle: 'Verification Intelligence Hub',
    description:
      'Instantly validate credentials with cryptographic proof paths and anti-fraud checks.',
    icon: FileBadge2,
    href: PORTAL_URLS.recruiter,
  },
  {
    title: 'CredVerse Gateway',
    subtitle: 'Unified Public Surface',
    description:
      'A polished entrypoint for demos, product positioning, and partner onboarding conversations.',
    icon: Globe2,
    href: '#top',
  },
];

const capabilities = [
  'W3C DID + Verifiable Credential aligned structures',
  'OID4VCI / OID4VP interaction-ready pathways',
  'Blockchain anchoring + revocation lifecycle',
  'ZK-proof-native architecture trajectory',
  'Role-scoped authz + API key controls',
  'Cross-service release gating and auditability',
];

const digilockerCompatibility = [
  'Document-backed issuance workflows can be mapped cleanly into credential templates.',
  'Existing integration hooks support DigiLocker-aligned ingestion and verification flows.',
  'Consent and compliance pathways are designed for India-first deployment contexts.',
  'CredVerse can act as a Web2 ↔ Web3 trust bridge for institutions and hiring networks.',
];

const roadmap = [
  {
    phase: 'Phase 1 (Live)',
    title: 'Core trust layer shipped',
    details:
      'Issuer, Wallet, Recruiter, and Gateway are operational with hardened backend quality gates.',
  },
  {
    phase: 'Phase 2',
    title: 'Institution + DigiLocker integrations',
    details:
      'Deploy institution-grade onboarding, policy controls, and partner rails for production use.',
  },
  {
    phase: 'Phase 3',
    title: 'Advanced ZK verification fabric',
    details:
      'Extend from deterministic adapters into deeper production proving and federation layers.',
  },
];

const partnerStrip = ['W3C VC', 'Ethereum Sepolia', 'DigiLocker Compatible', 'OID4VCI', 'OID4VP', 'ZK-Ready'];

function App() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    organization: '',
    message: '',
  });

  const submitDemoRequest = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const subject = encodeURIComponent(`CredVerse Demo Request — ${form.organization || 'New Organization'}`);
    const body = encodeURIComponent(
      `Name: ${form.name}\nEmail: ${form.email}\nOrganization: ${form.organization}\n\nUse case:\n${form.message}`,
    );

    window.location.href = `mailto:${DEMO_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="site-shell" id="top">
      <div className="mesh mesh-a" />
      <div className="mesh mesh-b" />

      <header className="top-nav">
        <div className="brand">
          <div className="brand-icon-wrap">
            <img src="/credity-logo.jpg" alt="CredVerse" className="brand-logo" />
          </div>
          <span>CredVerse</span>
        </div>

        <div className="nav-links">
          <a href="#ecosystem">Ecosystem</a>
          <a href="#digilocker">DigiLocker</a>
          <a href="#roadmap">Roadmap</a>
          <a href="#contact">Contact</a>
        </div>

        <a className="nav-cta" href={PORTAL_URLS.issuer} target="_blank" rel="noreferrer">
          Open Platform
        </a>
      </header>

      <main className="content-wrap">
        <section className="hero">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="hero-copy"
          >
            <div className="hero-badge">
              <Sparkles size={14} />
              <span>Professional Web3 Credential Infrastructure</span>
            </div>

            <h1>
              A trust-grade credential ecosystem.
              <br />
              <span>Built for institutions. Ready for scale.</span>
            </h1>

            <p>
              CredVerse unifies issuance, holder experience, and recruiter verification into a
              standards-aligned stack — with blockchain anchoring, compliance-aware workflows, and
              DigiLocker-compatible integration pathways.
            </p>

            <div className="hero-actions">
              <a className="btn-primary" href="#ecosystem">
                Explore Products <ArrowRight size={16} />
              </a>
              <a className="btn-ghost" href="https://github.com/ragahv05-maker/credity" target="_blank" rel="noreferrer">
                View Codebase
              </a>
            </div>
          </motion.div>

          <motion.div
            className="hero-visual"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08 }}
          >
            <ArchitecturePulse />
            <div className="hero-visual-note">
              <Radar size={14} />
              <span>Live positioning for demos, partnerships, and institutional pitches</span>
            </div>
          </motion.div>
        </section>

        <section className="metric-grid" aria-label="key-metrics">
          {metrics.map((metric, index) => (
            <motion.article
              key={metric.label}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.3, delay: index * 0.06 }}
              className="metric-card"
            >
              <strong>
                <CountUp end={metric.end} duration={1.2} suffix={metric.suffix} enableScrollSpy scrollSpyOnce />
              </strong>
              <span>{metric.label}</span>
            </motion.article>
          ))}
        </section>

        <section className="ticker-wrap" aria-label="compatibility-strip">
          <Marquee gradient={false} speed={36} pauseOnHover>
            {partnerStrip.map((item) => (
              <div key={item} className="ticker-pill">
                {item}
              </div>
            ))}
          </Marquee>
        </section>

        <section className="section" id="ecosystem">
          <div className="section-head">
            <h2>Ecosystem Products</h2>
            <p>Interactive, presentation-ready modules you can show to clients and Web3 communities.</p>
          </div>

          <div className="card-grid">
            {ecosystemCards.map((card, index) => {
              const Icon = card.icon;

              return (
                <Tilt key={card.title} glareEnable glareMaxOpacity={0.08} tiltMaxAngleX={5} tiltMaxAngleY={5}>
                  <motion.article
                    className="product-card"
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-80px' }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                  >
                    <div className="card-head">
                      <div className="card-icon">
                        <Icon size={18} />
                      </div>
                      <div>
                        <h3>{card.title}</h3>
                        <small>{card.subtitle}</small>
                      </div>
                    </div>
                    <p>{card.description}</p>
                    <a href={card.href} target="_blank" rel="noreferrer">
                      Open <ArrowRight size={14} />
                    </a>
                  </motion.article>
                </Tilt>
              );
            })}
          </div>
        </section>

        <section className="section" id="capabilities">
          <div className="section-head">
            <h2>Capability Surface</h2>
            <p>Enterprise-friendly language with technical depth behind the scenes.</p>
          </div>

          <div className="pill-wrap">
            {capabilities.map((item) => (
              <div className="cap-pill" key={item}>
                <CheckCircle2 size={14} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section" id="digilocker">
          <div className="section-head">
            <h2>DigiLocker Compatibility</h2>
            <p>Purpose-fit messaging for India-focused institutional deployment conversations.</p>
          </div>

          <article className="focus-card">
            <div className="focus-head">
              <div className="focus-icon">
                <BookCheck size={18} />
              </div>
              <div>
                <h3>DigiLocker-aligned by architecture</h3>
                <small>Positioned as a practical bridge between existing records and Web3 trust rails</small>
              </div>
            </div>
            <ul>
              {digilockerCompatibility.map((point) => (
                <li key={point}>
                  <ShieldCheck size={14} />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="section" id="roadmap">
          <div className="section-head">
            <h2>Roadmap</h2>
            <p>A sharp plan you can present to stakeholders without sounding generic.</p>
          </div>

          <div className="timeline">
            {roadmap.map((item) => (
              <article className="timeline-item" key={item.phase}>
                <div className="timeline-icon">
                  <CalendarRange size={16} />
                </div>
                <div>
                  <span className="timeline-phase">{item.phase}</span>
                  <h3>{item.title}</h3>
                  <p>{item.details}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section" id="contact">
          <div className="section-head">
            <h2>Request Demo</h2>
            <p>Capture inbound interest directly from your website.</p>
          </div>

          <div className="contact-grid">
            <article className="focus-card">
              <div className="focus-head">
                <div className="focus-icon">
                  <Mail size={18} />
                </div>
                <div>
                  <h3>Demo / Partnership Form</h3>
                  <small>Routes via email (configurable)</small>
                </div>
              </div>

              <form className="demo-form" onSubmit={submitDemoRequest}>
                <input
                  placeholder="Your name"
                  required
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
                <input
                  type="email"
                  placeholder="Work email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                />
                <input
                  placeholder="Organization"
                  required
                  value={form.organization}
                  onChange={(e) => setForm((p) => ({ ...p, organization: e.target.value }))}
                />
                <textarea
                  rows={4}
                  placeholder="What do you want to verify / issue?"
                  required
                  value={form.message}
                  onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                />
                <button type="submit">
                  Send Request <ArrowRight size={14} />
                </button>
              </form>
            </article>

            <article className="focus-card side-cta">
              <div className="focus-head">
                <div className="focus-icon">
                  <Workflow size={18} />
                </div>
                <div>
                  <h3>Live Portal Links</h3>
                  <small>Use for instant demo transitions</small>
                </div>
              </div>

              <a href={PORTAL_URLS.issuer} target="_blank" rel="noreferrer">
                Issuer Portal <ArrowRight size={14} />
              </a>
              <a href={PORTAL_URLS.wallet} target="_blank" rel="noreferrer">
                Wallet Portal <ArrowRight size={14} />
              </a>
              <a href={PORTAL_URLS.recruiter} target="_blank" rel="noreferrer">
                Recruiter Portal <ArrowRight size={14} />
              </a>
              <a href="https://github.com/ragahv05-maker/credity" target="_blank" rel="noreferrer">
                Technical Proofs <ArrowRight size={14} />
              </a>

              <div className="note">
                <Lock size={14} />
                <span>
                  Set <code>VITE_DEMO_EMAIL</code> in deploy env to route requests to your inbox.
                </span>
              </div>
            </article>
          </div>
        </section>

        <section className="section final-cta">
          <h2>CredVerse is now built to impress — and convert.</h2>
          <p>
            Polished product narrative, distinctive interaction design, and real platform links in one
            professional public surface.
          </p>
          <div className="hero-actions">
            <a className="btn-primary" href={PORTAL_URLS.recruiter} target="_blank" rel="noreferrer">
              Launch Live Demo <ArrowRight size={15} />
            </a>
            <a className="btn-ghost" href={PORTAL_URLS.wallet} target="_blank" rel="noreferrer">
              Open Wallet Experience
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}

function ArchitecturePulse() {
  return (
    <div className="architecture-card" role="img" aria-label="CredVerse architecture pulse visualization">
      <svg viewBox="0 0 360 220" className="architecture-svg" fill="none">
        <motion.path
          d="M40 170 C 120 120, 160 80, 320 52"
          stroke="url(#lineA)"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0.1, opacity: 0.2 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2.4, repeat: Infinity, repeatType: 'mirror' }}
        />
        <motion.path
          d="M32 64 C 120 96, 214 150, 332 176"
          stroke="url(#lineB)"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0.08, opacity: 0.2 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2.8, repeat: Infinity, repeatType: 'mirror', delay: 0.3 }}
        />

        {[
          { x: 44, y: 170, label: 'Issuer' },
          { x: 146, y: 110, label: 'Wallet' },
          { x: 320, y: 52, label: 'Verifier' },
          { x: 332, y: 176, label: 'Gateway' },
        ].map((node, idx) => (
          <g key={node.label}>
            <motion.circle
              cx={node.x}
              cy={node.y}
              r="7"
              fill="#7cc4ff"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, delay: idx * 0.22 }}
            />
            <text x={node.x + 11} y={node.y + 4} className="node-label">
              {node.label}
            </text>
          </g>
        ))}

        <defs>
          <linearGradient id="lineA" x1="40" y1="170" x2="320" y2="52" gradientUnits="userSpaceOnUse">
            <stop stopColor="#69A3FF" />
            <stop offset="1" stopColor="#5FF3D6" />
          </linearGradient>
          <linearGradient id="lineB" x1="32" y1="64" x2="332" y2="176" gradientUnits="userSpaceOnUse">
            <stop stopColor="#5FF3D6" />
            <stop offset="1" stopColor="#69A3FF" />
          </linearGradient>
        </defs>
      </svg>

      <div className="architecture-legends">
        <div>
          <Blocks size={14} />
          <span>Credential graph</span>
        </div>
        <div>
          <Landmark size={14} />
          <span>Institution ready</span>
        </div>
      </div>
    </div>
  );
}

export default App;
