"use client";

import React, { useState, useEffect } from 'react';
import { fetchApi } from "../../../lib/api";
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { Drawer } from '@/components/Drawer';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<'keys' | 'webhooks'>('keys');

  // API Keys state
  const [keys, setKeys] = useState<any[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [isCreateKeyOpen, setIsCreateKeyOpen] = useState(false);
  const [newKeyData, setNewKeyData] = useState<any>(null);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const [newKeyForm, setNewKeyForm] = useState({ name: '', scopes: [] as string[] });

  // Webhooks state
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [webhooksLoading, setWebhooksLoading] = useState(true);
  const [isCreateWebhookOpen, setIsCreateWebhookOpen] = useState(false);
  const [viewingWebhookId, setViewingWebhookId] = useState<string | null>(null);
  const [webhookDeliveries, setWebhookDeliveries] = useState<any[]>([]);
  const [newWebhookForm, setNewWebhookForm] = useState({ url: '', events: [] as string[] });

  const loadKeys = async () => {
    try {
      const data = await fetchApi("http://localhost:8080/admin/api-keys");
      setKeys(data || []);
    } catch (err) {
      console.error("Failed to load keys", err);
    } finally {
      setKeysLoading(false);
    }
  };

  const loadWebhooks = async () => {
    try {
      const data = await fetchApi("http://localhost:8080/admin/webhooks");
      setWebhooks(data || []);
    } catch (err) {
      console.error("Failed to load webhooks", err);
    } finally {
      setWebhooksLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
    loadWebhooks();
  }, []);

  const handleGenerateKey = async () => {
    try {
      const data = await fetchApi("http://localhost:8080/admin/api-keys", {
        method: "POST",
        body: JSON.stringify(newKeyForm)
      });
      setNewKeyData(data); // Assuming data returns { id, key, ... }
      loadKeys();
    } catch (err) {
      console.error("Failed to generate key", err);
      alert("Failed to generate key");
    }
  };

  const handleRevokeKey = async () => {
    if (!revokingKeyId) return;
    try {
      await fetchApi(`http://localhost:8080/admin/api-keys/${revokingKeyId}`, { method: "DELETE" });
      setRevokingKeyId(null);
      loadKeys();
    } catch (err) {
      console.error("Failed to revoke key", err);
      alert("Failed to revoke key");
    }
  };

  const handleCloseKeyModal = () => {
    setIsCreateKeyOpen(false);
    setNewKeyData(null);
    setNewKeyForm({ name: '', scopes: [] });
  };

  const handleAddWebhook = async () => {
    try {
      await fetchApi("http://localhost:8080/admin/webhooks", {
        method: "POST",
        body: JSON.stringify({ url: newWebhookForm.url, events: newWebhookForm.events, is_active: true })
      });
      setIsCreateWebhookOpen(false);
      setNewWebhookForm({ url: '', events: [] });
      loadWebhooks();
    } catch (err) {
      console.error("Failed to add webhook", err);
      alert("Failed to add webhook");
    }
  };

  const handleViewDeliveries = async (id: string) => {
    setViewingWebhookId(id);
    try {
      const data = await fetchApi(`http://localhost:8080/admin/webhooks/${id}/deliveries`);
      setWebhookDeliveries(data || []);
    } catch (err) {
      console.error("Failed to load deliveries", err);
    }
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
          {keysLoading ? <div>Loading keys...</div> : (
            <DataTable
              columns={[
                { key: 'name', header: 'Name', render: (k) => <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{k.name}</span> },
                { key: 'prefix', header: 'Key Prefix', render: (k) => <span style={{ fontFamily: 'var(--font-jetbrains-mono)', color: 'var(--text-secondary)' }}>{k.key_prefix}</span> },
                { key: 'scopes', header: 'Scopes', render: (k) => (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(k.scopes || []).map((s: string) => <span key={s} style={{ padding: '2px 6px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem' }}>{s}</span>)}
                  </div>
                )},
                { key: 'created', header: 'Created', render: (k) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{new Date(k.created_at).toLocaleDateString()}</span> },
                { key: 'used', header: 'Last Used', render: (k) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Never'}</span> },
                { key: 'actions', header: '', render: (k) => (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => setRevokingKeyId(k.id)} style={{ background: 'none', border: 'none', color: 'var(--risk-critical)', cursor: 'pointer', fontSize: '0.85rem', padding: '4px 8px' }}>Revoke</button>
                  </div>
                )}
              ]}
              rows={keys}
            />
          )}
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
          {webhooksLoading ? <div>Loading webhooks...</div> : (
            <DataTable
              columns={[
                { key: 'url', header: 'Webhook URL', render: (w) => <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{w.url}</span> },
                { key: 'events', header: 'Subscribed Events', render: (w) => (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(w.events || []).map((e: string) => <span key={e} style={{ padding: '2px 6px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem' }}>{e}</span>)}
                  </div>
                )},
                { key: 'status', header: 'Status', render: (w) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: w.is_active ? 'var(--risk-low)' : 'var(--risk-critical)' }} />
                    <span style={{ textTransform: 'capitalize' }}>{w.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                )},
                { key: 'success', header: 'Success Rate', render: (w) => <span style={{ color: (w.success_rate_pct || 100) < 90 ? 'var(--risk-critical)' : 'var(--text-primary)' }}>{w.success_rate_pct || 100}%</span> },
                { key: 'actions', header: '', render: (w) => (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => handleViewDeliveries(w.id)} style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>View Deliveries</button>
                  </div>
                )}
              ]}
              rows={webhooks}
            />
          )}
        </div>
      )}

      {/* Modals & Drawers */}

      {/* Generate API Key Modal */}
      <Modal isOpen={isCreateKeyOpen} onClose={handleCloseKeyModal} title="Generate API Key" width={newKeyData ? "550px" : "400px"}>
        {!newKeyData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Key Name</label>
              <input type="text" value={newKeyForm.name} onChange={e => setNewKeyForm({...newKeyForm, name: e.target.value})} placeholder="e.g., Backend Worker" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Scopes</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {['read_only', 'evaluate', 'report'].map(scope => (
                  <label key={scope} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                    <input 
                      type="checkbox" 
                      checked={newKeyForm.scopes.includes(scope)}
                      onChange={e => {
                        const newScopes = e.target.checked ? [...newKeyForm.scopes, scope] : newKeyForm.scopes.filter(s => s !== scope);
                        setNewKeyForm({...newKeyForm, scopes: newScopes});
                      }} 
                    /> {scope}
                  </label>
                ))}
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
                <input readOnly value={newKeyData.key || ''} style={{ flexGrow: 1, padding: '12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-jetbrains-mono)', fontSize: '0.875rem' }} />
                <button 
                  onClick={() => navigator.clipboard.writeText(newKeyData.key || '')}
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
        onConfirm={handleRevokeKey}
        onCancel={() => setRevokingKeyId(null)}
      />

      {/* Add Webhook Modal */}
      <Modal isOpen={isCreateWebhookOpen} onClose={() => setIsCreateWebhookOpen(false)} title="Add Webhook" width="500px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Webhook URL</label>
            <input type="url" value={newWebhookForm.url} onChange={e => setNewWebhookForm({...newWebhookForm, url: e.target.value})} placeholder="https://" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} />
          </div>
          <div>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Events to send</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {['case.created', 'case.resolved', 'rule.breached'].map(event => (
                <label key={event} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                  <input 
                    type="checkbox" 
                    checked={newWebhookForm.events.includes(event)}
                    onChange={e => {
                      const newEvents = e.target.checked ? [...newWebhookForm.events, event] : newWebhookForm.events.filter(ev => ev !== event);
                      setNewWebhookForm({...newWebhookForm, events: newEvents});
                    }}
                  /> {event}
                </label>
              ))}
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
            <button onClick={handleAddWebhook} style={{ padding: '8px 16px', backgroundColor: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Add Webhook</button>
          </div>
        </div>
      </Modal>

      {/* Webhook Delivery Log Drawer */}
      <Drawer isOpen={!!viewingWebhookId} onClose={() => setViewingWebhookId(null)} title="Delivery Logs" width="600px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Recent deliveries for this webhook endpoint.</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {webhookDeliveries.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center', padding: '32px' }}>No deliveries recorded yet.</div>
            ) : webhookDeliveries.map(del => (
              <div key={del.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: del.success ? 'var(--risk-low)' : 'var(--risk-critical)' }} />
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{del.event_type}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{new Date(del.created_at).toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'var(--font-jetbrains-mono)' }}>HTTP {del.response_status}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{del.response_ms}ms</div>
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
