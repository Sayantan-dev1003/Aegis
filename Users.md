# Aegis Platform: User Roles, Responsibilities & Limitations

This document outlines the **ideal** structure for Role-Based Access Control (RBAC) in a fraud and risk management system like Aegis. It defines what each role *should* be capable of doing, regardless of the current implementation state.

---

## 1. Admin (Administrator)
The Admin is the "Super User" responsible for configuring, maintaining, and overseeing the entire Aegis platform. They manage the system's infrastructure, rules, and personnel access.

### 🔹 Responsibilities & Permissions
* **User Management:** Can invite new users, assign/change roles (Admin, Reviewer, Viewer), and revoke access.
* **Rules & Engine Configuration:** Full access to create, edit, delete, and test fraud detection rules and velocity limits.
* **Model Management:** Can trigger model retraining, adjust hyperparameter configurations, and deploy new ML models to production.
* **Queue & Routing Configuration:** Responsible for creating manual review queues, setting SLAs, and defining routing logic (e.g., Round Robin, Skill-based).
* **System Integrations:** Can manage API keys, webhooks, and third-party integrations (e.g., payment gateways, external KYC providers).
* **Audit & Monitoring:** Full access to system health metrics, audit logs, and overall performance dashboards.

### 🔸 Limitations (Best Practices)
* **Separation of Duties:** In highly regulated environments (like banking), Admins should ideally *not* process or approve individual escalated cases themselves to prevent internal fraud. Their job is to build the system, not act on the data.
* **Audit Trail:** Even Admins cannot delete or modify the unalterable system Audit Logs. Every configuration change they make is permanently recorded.

---

## 2. Reviewer (Fraud Analyst / Investigator)
The Reviewer is the operational workforce. They spend their time in the manual review queues investigating cases that the automated system has flagged as suspicious.

### 🔹 Responsibilities & Permissions
* **Case Management:** Can view, claim, and work on escalated transactions from their assigned queues.
* **Decision Making:** Authorized to mark transactions as `Approved`, `Declined`, or `Blocked` based on manual investigation.
* **Data Access:** Full access to the Transaction Ledger to view user histories, linked accounts, and device fingerprints to make informed decisions.
* **Case Annotation:** Can add internal notes, tags, and attach evidence to specific transactions or user profiles.
* **Feedback Loop:** Their decisions (Approve/Decline) automatically feed back into the ML pipeline as labeled training data.

### 🔸 Limitations
* **No Configuration Changes:** Cannot create, edit, or delete Rules, Velocity limits, or ML Models.
* **No System Management:** Cannot manage other users, change roles, or access API/Integration settings.
* **Restricted Queue Access:** Usually limited to viewing and pulling cases only from the queues they are explicitly assigned to (e.g., a junior reviewer cannot access the "High Value Transactions" queue).

---

## 3. Viewer (Auditor / Executive / Compliance)
The Viewer role is designed for stakeholders who need to monitor system performance, review historical data, or ensure compliance, but should not have the ability to change the system state.

### 🔹 Responsibilities & Permissions
* **Reporting & Analytics:** Can view dashboards, metrics, and KPI reports (e.g., Queue SLA breach rates, total fraud blocked).
* **Read-Only Ledger Access:** Can view the complete Transaction Ledger and case histories to understand *how* a specific case was handled.
* **Audit Log Review:** Full read access to the system Audit Log to track "who did what and when" (ideal for compliance officers).
* **Rule/Model Visibility:** Can view the active rules and models to understand the current logic, but cannot edit them.

### 🔸 Limitations
* **Strictly Read-Only:** Cannot make any changes to the system. No CRUD (Create, Read, Update, Delete) rights outside of generating reports.
* **No Action on Cases:** Cannot approve, reject, or comment on escalated transactions.
* **No PII Export (Optional but recommended):** May be restricted from exporting raw Personally Identifiable Information (PII) to Excel/CSV to prevent data leaks.
