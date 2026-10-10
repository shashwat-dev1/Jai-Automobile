"""
DSA OS — Role-Based Access Control (RBAC) Permissions

Authoritative permission matrix per SRS Appendix B.
"""

from typing import Final

# Permissions
PERM_CASES_CREATE: Final[str] = "cases:create"
PERM_CASES_READ: Final[str] = "cases:read"
PERM_CASES_UPDATE: Final[str] = "cases:update"
PERM_CASES_STATUS: Final[str] = "cases:change_status"

PERM_DOCS_UPLOAD: Final[str] = "documents:upload"
PERM_DOCS_READ: Final[str] = "documents:read"
PERM_DOCS_ARCHIVE: Final[str] = "documents:archive"
PERM_DOCS_REVEAL: Final[str] = "documents:reveal_masked"

PERM_PAYOUT_READ: Final[str] = "payout:read"
PERM_PAYOUT_UPDATE: Final[str] = "payout:update"

PERM_RECON_READ: Final[str] = "reconciliation:read"
PERM_RECON_UPDATE: Final[str] = "reconciliation:update"

PERM_SOURCES_MANAGE: Final[str] = "sources:manage"
PERM_TEAM_READ: Final[str] = "team:read"
PERM_DATA_EXPORT: Final[str] = "data:export"

PERM_USERS_MANAGE: Final[str] = "users:manage"
PERM_AUDIT_READ: Final[str] = "audit:read"

PERM_LENDERS_READ: Final[str] = "lenders:read"
PERM_LENDERS_MANAGE: Final[str] = "lenders:manage"

PERM_TASKS_READ: Final[str] = "tasks:read"
PERM_TASKS_MANAGE: Final[str] = "tasks:manage"

PERM_SLA_MANAGE: Final[str] = "sla:manage"

PERM_PDD_READ: Final[str] = "pdd:read"
PERM_PDD_MANAGE: Final[str] = "pdd:manage"

PERM_REFERRALS_READ: Final[str] = "referrals:read"
PERM_REFERRALS_MANAGE: Final[str] = "referrals:manage"


# Mapping from role to allowed permissions
ROLE_PERMISSIONS: dict[str, set[str]] = {
    "platform_admin": {
        PERM_USERS_MANAGE,
        PERM_AUDIT_READ,
        PERM_DATA_EXPORT,
        PERM_CASES_READ,
        PERM_REFERRALS_READ,
    },
    "owner": {
        PERM_CASES_CREATE,
        PERM_CASES_READ,
        PERM_CASES_UPDATE,
        PERM_CASES_STATUS,
        PERM_DOCS_UPLOAD,
        PERM_DOCS_READ,
        PERM_DOCS_ARCHIVE,
        PERM_DOCS_REVEAL,
        PERM_PAYOUT_READ,
        PERM_PAYOUT_UPDATE,
        PERM_RECON_READ,
        PERM_RECON_UPDATE,
        PERM_SOURCES_MANAGE,
        PERM_TEAM_READ,
        PERM_DATA_EXPORT,
        PERM_USERS_MANAGE,
        PERM_AUDIT_READ,
        PERM_LENDERS_READ,
        PERM_LENDERS_MANAGE,
        PERM_TASKS_READ,
        PERM_TASKS_MANAGE,
        PERM_SLA_MANAGE,
        PERM_PDD_READ,
        PERM_PDD_MANAGE,
        PERM_REFERRALS_READ,
        PERM_REFERRALS_MANAGE,
    },
    "admin": {
        PERM_CASES_CREATE,
        PERM_CASES_READ,
        PERM_CASES_UPDATE,
        PERM_CASES_STATUS,
        PERM_DOCS_UPLOAD,
        PERM_DOCS_READ,
        PERM_DOCS_ARCHIVE,
        PERM_DOCS_REVEAL,
        PERM_PAYOUT_READ,
        PERM_PAYOUT_UPDATE,
        PERM_RECON_READ,
        PERM_RECON_UPDATE,
        PERM_SOURCES_MANAGE,
        PERM_TEAM_READ,
        PERM_DATA_EXPORT,
        PERM_USERS_MANAGE,
        PERM_AUDIT_READ,
        PERM_LENDERS_READ,
        PERM_LENDERS_MANAGE,
        PERM_TASKS_READ,
        PERM_TASKS_MANAGE,
        PERM_SLA_MANAGE,
        PERM_PDD_READ,
        PERM_PDD_MANAGE,
        PERM_REFERRALS_READ,
        PERM_REFERRALS_MANAGE,
    },
    "manager": {
        PERM_CASES_CREATE,
        PERM_CASES_READ,
        PERM_CASES_UPDATE,
        PERM_CASES_STATUS,
        PERM_DOCS_UPLOAD,
        PERM_DOCS_READ,
        PERM_DOCS_ARCHIVE,
        PERM_DOCS_REVEAL,
        PERM_PAYOUT_READ,
        PERM_PAYOUT_UPDATE,
        PERM_SOURCES_MANAGE,
        PERM_TEAM_READ,
        PERM_DATA_EXPORT,
        PERM_LENDERS_READ,
        PERM_LENDERS_MANAGE,
        PERM_TASKS_READ,
        PERM_TASKS_MANAGE,
        PERM_PDD_READ,
        PERM_PDD_MANAGE,
        PERM_REFERRALS_READ,
        PERM_REFERRALS_MANAGE,
    },
    "telecaller": {
        PERM_CASES_READ,
        PERM_CASES_UPDATE,
        PERM_TASKS_READ,
        PERM_DOCS_READ,
    },
    "processor": {
        PERM_CASES_CREATE,
        PERM_CASES_READ,
        PERM_CASES_UPDATE,
        PERM_CASES_STATUS,
        PERM_DOCS_UPLOAD,
        PERM_DOCS_READ,
        PERM_LENDERS_READ,
        PERM_TASKS_READ,
        PERM_TASKS_MANAGE,
        PERM_PDD_READ,
        PERM_PDD_MANAGE,
        PERM_REFERRALS_READ,
    },
    "field_executive": {
        PERM_CASES_CREATE,
        PERM_CASES_READ,  # Own cases
        PERM_CASES_UPDATE,  # Own cases
        PERM_CASES_STATUS,  # Limited transitions
        PERM_DOCS_UPLOAD,  # Own cases
        PERM_DOCS_READ,  # Own cases
        PERM_TEAM_READ,  # Own performance
        PERM_TASKS_READ,
        PERM_TASKS_MANAGE,
        PERM_PDD_READ,
        PERM_PDD_MANAGE,
    },
    "accountant": {
        PERM_CASES_READ,  # Read-only case financial context
        PERM_DOCS_REVEAL,  # Bank statement details
        PERM_PAYOUT_READ,
        PERM_PAYOUT_UPDATE,
        PERM_RECON_READ,
        PERM_RECON_UPDATE,
        PERM_SOURCES_MANAGE,
        PERM_DATA_EXPORT,
        PERM_LENDERS_READ,
        PERM_TASKS_READ,
        PERM_PDD_READ,
        PERM_REFERRALS_READ,
    },
    "auditor": {
        PERM_CASES_READ,
        PERM_DOCS_READ,  # Access is logged
        PERM_PAYOUT_READ,
        PERM_TEAM_READ,
        PERM_AUDIT_READ,
        PERM_LENDERS_READ,
        PERM_TASKS_READ,
        PERM_PDD_READ,
        PERM_REFERRALS_READ,
    },
}


def has_permission(role: str, permission: str) -> bool:
    """Check if the given role possesses the required permission."""
    return permission in ROLE_PERMISSIONS.get(role, set())
