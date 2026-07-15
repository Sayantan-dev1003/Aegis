"use client";

import React, { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { Drawer } from '@/components/Drawer';
import { ConfirmDialog } from '@/components/ConfirmDialog';

// Dummy Data
const initialKeys = [
  { id: 'key-1', name: 'Production Backend', keyPrefix: 'sk_live_****1a9b', scopes: ['evaluate', 'report'], createdAt: '2025-10-12', lastUsedAt: 'Just now' },
  { id: 'key-2', name: 'Data Science Scraper', keyPrefix: 'sk_live_****8f22', scopes: ['read_only'], createdAt: '2026-02-05', lastUsedAt: '2 days ago' },
  { id: 'key-3', name: 'Staging Env', keyPrefix: 'sk_test_****3e44', scopes: ['evaluate'], createdAt: '2026-06-20', lastUsedAt: 'Never' },
];

const initialWebhooks = [
  { id: 'wh-1', url: 'https://api.acme.com/webhooks/aegis', events: ['case.created', 'case.resolved'], status: 'active', successRatePct: 99.8, lastDeliveryAt: '10 mins ago' },
  { id: 'wh-2', url: 'https://internal-tools.acme.corp/slack-alert', events: ['rule.breached'], status: 'failing', successRatePct: 45.2, lastDeliveryAt: 'Failed 2 mins ago' },
];

const mockDeliveries = [
  { id: 'del-1', timestamp: '2026-07-15 14:22:10', event: 'case.created', statusCode: 200, responseMs: 145, success: true },
  { id: 'del-2', timestamp: '2026-07-15 13:10:05', event: 'case.resolved', statusCode: 200, responseMs: 120, success: true },
  { id: 'del-3', timestamp: '2026-07-15 11:05:00', event: 'rule.breached', statusCode: 503, responseMs: 2500, success: false },
  { id: 'del-4', timestamp: '2026-07-15 10:15:22', event: 'case.created', statusCode: 200, responseMs: 180, success: true },
];

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<'keys' | 'webhooks'>('keys');

  // API Keys state
  const [keys, setKeys] = useState(initialKeys);
  const [isCreateKeyOpen, setIsCreateKeyOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  // Webhooks state
  const [webhooks, setWebhooks] = useState(initialWebhooks);
  const [isCreateWebhookOpen, setIsCreateWebhookOpen] = useState(false);
  const [viewingWebhookId, setViewingWebhookId] = useState<string | null>(null);

  const handleGenerateKey = () => {
    // Mock key generation
    const generated = 'sk_live_' + Array.from({length: 24}, () => Math.random().toString(36).charAt(2)).join('');
    setNewKey(generated);
  };

  const handleCloseKeyModal = () => {
    setIsCreateKeyOpen(false);
    setNewKey(null); // Clear key on close to enforce "shown once"
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', paddingBottom: 'var(--space-xl)' }}>
      {/* Header */}
      <div>
        <h1 style={{ margin: '0 0 4px 0', fontSize: '1.5rem', color: 'var(--text-primary)' }}>Integrations</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Manage programmatic access and event subscriptions.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '24px' }}>
        <button 
          onClick={() => setActiveTab('keys')}
          style={{ background: 'none', border: 'none', padding: '12px 0', color: activeTab === 'keys' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: activeTab === 'keys' ? 600 : 400, borderBottom: activeTab === 'keys' ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', fontSize: '0.875rem' }}
        >
          API Keys
        </button>
        <button 
          onClick={() => setActiveTab('webhooks')}
          style={{ background: 'none', border: 'none', padding: '12px 0', color: activeTab === 'webhooks' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: activeTab === 'webhooks' ? 600 : 400, borderBottom: activeTab === 'webhooks' ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', fontSize: '0.875rem' }}
        >
          Webhooks
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'keys' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setIsCreateKeyOpen(true)}
              style={{ backgroundColor: 'var(--accent)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
            >
              + Generate New Key
            </button>
          </div>
          <DataTable
            columns={[
              { key: 'name', header: 'Name', render: (k) => <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{k.name}</span> },
              { key: 'prefix', header: 'Key Prefix', render: (k) => <span style={{ fontFamily: 'var(--font-jetbrains-mono)', color: 'var(--text-secondary)' }}>{k.keyPrefix}</span> },
              { key: 'scopes', header: 'Scopes', render: (k) => (
                <div style={{ display: 'flex', gap: '4px' }}>
                  {k.scopes.map((s: string) => <span key={s} style={{ padding: '2px 6px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem' }}>{s}</span>)}
                </div>
              )},
              { key: 'created', header: 'Created', render: (k) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{k.createdAt}</span> },
              { key: 'used', header: 'Last Used', render: (k) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{k.lastUsedAt}</span> },
              { key: 'actions', header: '', render: (k) => (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setRevokingKeyId(k.id)} style={{ background: 'none', border: 'none', color: 'var(--risk-critical)', cursor: 'pointer', fontSize: '0.85rem', padding: '4px 8px' }}>Revoke</button>
                </div>
              )}
            ]}
            rows={keys}
          />
        </div>
      )}

      {activeTab === 'webhooks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setIsCreateWebhookOpen(true)}
              style={{ backgroundColor: 'var(--accent)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
            >
              + Add Webhook
            </button>
          </div>
          <DataTable
            columns={[
              { key: 'url', header: 'Webhook URL', render: (w) => <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{w.url}</span> },
              { key: 'events', header: 'Subscribed Events', render: (w) => (
                <div style={{ display: 'flex', gap: '4px' }}>
                  {w.events.map((e: string) => <span key={e} style={{ padding: '2px 6px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem' }}>{e}</span>)}
                </div>
              )},
              { key: 'status', header: 'Status', render: (w) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: w.status === 'active' ? 'var(--risk-low)' : 'var(--risk-critical)' }} />
                  <span style={{ textTransform: 'capitalize' }}>{w.status}</span>
                </div>
              )},
              { key: 'success', header: 'Success Rate', render: (w) => <span style={{ color: w.successRatePct < 90 ? 'var(--risk-critical)' : 'var(--text-primary)' }}>{w.successRatePct}%</span> },
              { key: 'delivered', header: 'Last Delivery', render: (w) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{w.lastDeliveryAt}</span> },
              { key: 'actions', header: '', render: (w) => (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setViewingWebhookId(w.id)} style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>View Deliveries</button>
                </div>
              )}
            ]}
            rows={webhooks}
          />
        </div>
      )}

      {/* Modals & Drawers */}

      {/* Generate API Key Modal */}
      <Modal isOpen={isCreateKeyOpen} onClose={handleCloseKeyModal} title="Generate API Key" width={newKey ? "550px" : "400px"}>
        {!newKey ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Key Name</label>
              <input type="text" placeholder="e.g., Backend Worker" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Scopes</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '0.875rem' }}><input type="checkbox" /> read_only</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '0.875rem' }}><input type="checkbox" /> evaluate</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '0.875rem' }}><input type="checkbox" /> report</label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <button onClick={handleCloseKeyModal} style={{ padding: '8px 16px', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleGenerateKey} style={{ padding: '8px 16px', backgroundColor: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Generate Key</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ padding: '16px', backgroundColor: 'rgba(245, 165, 36, 0.1)', border: '1px solid var(--risk-medium)', borderRadius: 'var(--radius-md)' }}>
              <h4 style={{ color: 'var(--risk-medium)', margin: '0 0 8px 0' }}>Store this key securely</h4>
              <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.875rem', lineHeight: 1.5 }}>
                For security reasons, this key will <strong>never be shown again</strong>. If you lose it, you will need to revoke it and generate a new one.
              </p>
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Your new API Key</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input readOnly value={newKey} style={{ flexGrow: 1, padding: '12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-jetbrains-mono)', fontSize: '0.875rem' }} />
                <button 
                  onClick={() => navigator.clipboard.writeText(newKey)}
                  style={{ padding: '0 16px', backgroundColor: 'var(--bg-surface-hover)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                >
                  Copy
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={handleCloseKeyModal} style={{ padding: '8px 16px', backgroundColor: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>I have copied this key</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Revoke Key Confirm */}
      <ConfirmDialog
        isOpen={!!revokingKeyId}
        title="Revoke API Key"
        description="Are you sure you want to revoke this API key? Any applications using this key will immediately lose access and requests will fail."
        confirmLabel="Revoke Key"
        danger={true}
        onConfirm={() => {
          setKeys(keys.filter(k => k.id !== revokingKeyId));
          setRevokingKeyId(null);
        }}
        onCancel={() => setRevokingKeyId(null)}
      />

      {/* Add Webhook Modal */}
      <Modal isOpen={isCreateWebhookOpen} onClose={() => setIsCreateWebhookOpen(false)} title="Add Webhook" width="500px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Webhook URL</label>
            <input type="url" placeholder="https://" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} />
          </div>
          <div>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Events to send</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '0.875rem' }}><input type="checkbox" /> case.created</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '0.875rem' }}><input type="checkbox" /> case.resolved</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '0.875rem' }}><input type="checkbox" /> rule.breached</label>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Signing Secret</label>
            <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px dashed var(--border-color)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', textAlign: 'center' }}>
              A secret will be generated securely upon creation.
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <button onClick={() => setIsCreateWebhookOpen(false)} style={{ padding: '8px 16px', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => setIsCreateWebhookOpen(false)} style={{ padding: '8px 16px', backgroundColor: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Add Webhook</button>
          </div>
        </div>
      </Modal>

      {/* Webhook Delivery Log Drawer */}
      <Drawer isOpen={!!viewingWebhookId} onClose={() => setViewingWebhookId(null)} title="Delivery Logs" width="600px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Recent deliveries for this webhook endpoint.</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {mockDeliveries.map(del => (
              <div key={del.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: del.success ? 'var(--risk-low)' : 'var(--risk-critical)' }} />
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{del.event}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{del.timestamp}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'var(--font-jetbrains-mono)' }}>HTTP {del.statusCode}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{del.responseMs}ms</div>
                  </div>
                  {!del.success && (
                    <button style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>Retry</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Drawer>

    </div>
  );
}
