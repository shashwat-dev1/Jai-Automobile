"""
DSA OS — Domain Exception Hierarchy

All application exceptions inherit from DsaOsError.
HTTP status codes are assigned at the router/middleware layer, not here.
This keeps domain logic free of HTTP concerns.
"""

from typing import Any


class DsaOsError(Exception):
    """Base exception for all DSA OS domain errors."""

    def __init__(
        self,
        message: str,
        code: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        self.message = message
        self.code = code or self.__class__.__name__
        self.details = details or {}
        super().__init__(message)


# =============================================================================
# Authentication & Authorization Exceptions
# =============================================================================


class AuthenticationError(DsaOsError):
    """Authentication failed — invalid credentials, expired token, etc."""

    pass


class TokenExpiredError(AuthenticationError):
    """Access or refresh token has expired."""

    pass


class TokenInvalidError(AuthenticationError):
    """Token is malformed or signature verification failed."""

    pass


class SessionRevokedError(AuthenticationError):
    """
    Session has been revoked via auth_version increment.
    Fail-closed: request must be rejected with 401.
    """

    pass


class AccountLockedError(AuthenticationError):
    """Account is locked due to excessive failed login attempts."""

    def __init__(self, message: str, locked_until: str | None = None):
        super().__init__(message, code="ACCOUNT_LOCKED", details={"locked_until": locked_until})


class AccountDisabledError(AuthenticationError):
    """User account has been deactivated by an Owner."""

    pass


class PermissionDeniedError(DsaOsError):
    """User lacks required role/permission for this operation."""

    pass


class CrossTenantAccessError(DsaOsError):
    """
    Attempt to access another organization's data.
    This should never happen in normal operation (RLS prevents it at DB level).
    If raised, it indicates a serious application-level bug.
    """

    pass


# =============================================================================
# Resource Exceptions
# =============================================================================


class NotFoundError(DsaOsError):
    """Requested resource does not exist or is not visible to the caller."""

    def __init__(self, resource: str, identifier: str | None = None):
        message = f"{resource} not found"
        if identifier:
            message = f"{resource} '{identifier}' not found"
        super().__init__(
            message,
            code="NOT_FOUND",
            details={"resource": resource, "id": identifier},
        )


class ConflictError(DsaOsError):
    """Resource conflict — duplicate, optimistic locking failure, etc."""

    pass


class OptimisticLockError(ConflictError):
    """
    Optimistic locking failure: the record was modified by another request
    between read and update. Client must re-fetch and retry.
    """

    def __init__(self, resource: str):
        super().__init__(
            f"{resource} was modified by another request. Please refresh and try again.",
            code="OPTIMISTIC_LOCK_CONFLICT",
        )


class DuplicateError(ConflictError):
    """Duplicate record — unique constraint would be violated."""

    pass


# =============================================================================
# Validation Exceptions
# =============================================================================


class ValidationError(DsaOsError):
    """Domain-level validation failure (beyond Pydantic schema validation)."""

    pass


class BusinessRuleViolationError(DsaOsError):
    """
    Attempted operation violates a business rule.
    Example: Trying to set two winning lender applications for a case.
    """

    pass


class StateTransitionError(DsaOsError):
    """
    Invalid state machine transition attempted.
    Example: Moving a case from 'lead' directly to 'disbursed'.
    """

    def __init__(self, entity: str, from_status: str, to_status: str):
        super().__init__(
            f"Cannot transition {entity} from '{from_status}' to '{to_status}'",
            code="INVALID_STATE_TRANSITION",
            details={"entity": entity, "from": from_status, "to": to_status},
        )


# =============================================================================
# Document Exceptions
# =============================================================================


class DocumentSecurityError(DsaOsError):
    """
    Document access or operation violates security policy.
    Example: Attempting to generate a download URL for a quarantined document.
    """

    pass


class DocumentNotReadyError(DocumentSecurityError):
    """
    Document is not in a downloadable state.
    Only 'received', 'under_review', 'verified' documents may be downloaded.
    """

    def __init__(self, document_id: str, status: str):
        super().__init__(
            f"Document {document_id} cannot be accessed in status '{status}'",
            code="DOCUMENT_NOT_READY",
            details={"document_id": document_id, "status": status},
        )


class MalwareScanError(DsaOsError):
    """Malware detected in uploaded file."""

    pass


class FileValidationError(DsaOsError):
    """File content validation failed (magic bytes, size, type)."""

    pass


# =============================================================================
# Infrastructure Exceptions
# =============================================================================


class StorageError(DsaOsError):
    """Object storage operation failed."""

    pass


class DatabaseError(DsaOsError):
    """Unexpected database error (use sparingly — let SQLAlchemy exceptions propagate)."""

    pass


class ExternalServiceError(DsaOsError):
    """External service (Redis, MinIO, ClamAV) returned an error."""

    pass


# =============================================================================
# Financial Exceptions
# =============================================================================


class FinancialCalculationError(DsaOsError):
    """Payout or reconciliation calculation error."""

    pass


class PayoutRuleError(DsaOsError):
    """Payout rule configuration or application error."""

    pass
