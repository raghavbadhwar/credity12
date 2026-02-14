import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Blocks,
  Building2,
  CheckCircle2,
  FileKey2,
  Globe2,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Wallet,
  Workflow,
  Zap,
} from 'lucide-react';
import './App.css';

const PORTAL_URLS = {
  issuer: import.meta.env.VITE_ISSUER_URL || 'http://localhost:5001',
  wallet: import.meta.env.VITE_WALLET_URL || 'http://localhost:5002',
  recruiter: import.meta.env.VITE_RECRUITER_URL || 'http://localhost:5003',
};

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
      'Issue standards-compliant Verifiable Credentials with tamper-proof blockchain anchoring and revocation controls.',
    icon: Building2,
    href: PORTAL_URLS.issuer,
  },
  {
    title: 'BlockWallet Digi',
    subtitle: 'User Sovereignty Engine',
    description:
      'A holder-first wallet to claim, store, and share credentials with identity and consent controls.',
    icon: Wallet,
    href: PORTAL_URLS.wallet,
  },
  {
    title: 'CredVerse Recruiter',
    subtitle: 'Verification Intelligence Hub',
    description:
      'Instantly verify claims and credential proofs with fraud-resistant workflows for enterprise hiring.',
    icon: UserCheck,
    href: PORTAL_URLS.recruiter,
  },
  {
    title: 'CredVerse Gateway',
    subtitle: 'Unified Access Layer',
    description:
      'Single public entry-point that routes traffic across Issuer, Wallet, and Recruiter services.',
    icon: Globe2,
    href: '#top',
  },
];

const capabilityPills = [
  'W3C DID + Verifiable Credentials',
  'OID4VCI / OID4VP-aligned flows',
  'Blockchain anchoring + revocation',
  'ZK-proof native architecture path',
  'Role-based auth + API key guards',
  'Cross-service auditability',
];

const highlights = [
  {
    title: 'Interoperable by Design',
    description:
      'Credential artifacts are built around W3C VC semantics so institutions and verifiers can integrate without vendor lock-in.',
    icon: FileKey2,
  },
  {
    title: 'Security-First Architecture',
    description:
      'Defense-in-depth across authz, schema hardening, queue reliability, and release gating before deployment.',
    icon: ShieldCheck,
  },
  {
    title: 'Composable Web3 Stack',
    description:
      'Modular services let you deploy as a full ecosystem or plug specific capabilities into existing products.',
    icon: Blocks,
  },
  {
    title: 'Enterprise Workflow Fit',
    description:
      'From issuance to recruiter verification, the stack mirrors real-world institutional and hiring workflows.',
    icon: Workflow,
  },
];

function App() {
  return (
    <div className="site-shell" id="top">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <header className="top-nav">
        <div className="brand">
          <div className="brand-icon">
            <ShieldCheck size={18} />
          </div>
          <span>CredVerse</span>
        </div>
        <div className="nav-links">
          <a href="#ecosystem">Ecosystem</a>
          <a href="#capabilities">Capabilities</a>
          <a href="#why">Why CredVerse</a>
        </div>
        <a className="nav-cta" href={PORTAL_URLS.issuer} target="_blank" rel="noreferrer">
          Open Platform
        </a>
      </header>

      <main className="content-wrap">
        <motion.section
          className="hero"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="hero-badge">
            <Sparkles size={14} />
            <span>Web3 Credential Infrastructure</span>
          </div>

          <h1>
            Build trust into every credential.
            <br />
            <span>Issue. Hold. Verify. Instantly.</span>
          </h1>

          <p>
            CredVerse is an end-to-end credential ecosystem for institutions, users, and recruiters —
            powered by W3C DID/VC standards, blockchain proof anchoring, and a ZK-ready architecture.
          </p>

          <div className="hero-actions">
            <a className="btn-primary" href="#ecosystem">
              Explore Ecosystem <ArrowRight size={16} />
            </a>
            <a
              className="btn-ghost"
              href="https://github.com/ragahv05-maker/credity"
              target="_blank"
              rel="noreferrer"
            >
              View GitHub
            </a>
          </div>

          <div className="stat-grid">
            <div>
              <strong>4</strong>
              <span>Integrated Products</span>
            </div>
            <div>
              <strong>W3C</strong>
              <span>DID/VC Aligned</span>
            </div>
            <div>
              <strong>Sepolia</strong>
              <span>On-chain Proof Anchoring</span>
            </div>
          </div>
        </motion.section>

        <section className="section" id="ecosystem">
          <div className="section-head">
            <h2>Ecosystem</h2>
            <p>Four products. One verifiable trust layer.</p>
          </div>

          <div className="card-grid">
            {ecosystemCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <motion.article
                  key={card.title}
                  className="product-card"
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ delay: index * 0.06, duration: 0.32 }}
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
                    Visit <ArrowRight size={14} />
                  </a>
                </motion.article>
              );
            })}
          </div>
        </section>

        <section className="section" id="capabilities">
          <div className="section-head">
            <h2>Core Capabilities</h2>
            <p>Everything you’d expect from a modern Web3 credential stack.</p>
          </div>

          <div className="pill-wrap">
            {capabilityPills.map((item) => (
              <div className="cap-pill" key={item}>
                <CheckCircle2 size={14} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section" id="why">
          <div className="section-head">
            <h2>Why CredVerse</h2>
            <p>Purpose-built for institutional adoption and high-integrity verification.</p>
          </div>

          <div className="highlight-grid">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="highlight-card">
                  <div className="highlight-icon">
                    <Icon size={18} />
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="section final-cta">
          <h2>Ready to showcase CredVerse?</h2>
          <p>
            This website is designed as a project-facing experience you can share with institutions,
            partners, and Web3 communities.
          </p>
          <div className="hero-actions">
            <a className="btn-primary" href={PORTAL_URLS.recruiter} target="_blank" rel="noreferrer">
              Open Recruiter Demo <Zap size={15} />
            </a>
            <a className="btn-ghost" href={PORTAL_URLS.wallet} target="_blank" rel="noreferrer">
              Open Wallet Demo
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
