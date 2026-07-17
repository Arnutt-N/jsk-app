"""Transfer error message constants shared across the live chat modules.

transfer_session ValueError messages — kept as constants so the HTTP-status
mapping in admin_live_chat.transfer_conversation (substring match) and the
WS handler stay aligned with the text raised here. Tests assert against these.
"""

TRANSFER_ERR_NO_ACTIVE_SESSION = "No active session found"
TRANSFER_ERR_NOT_CURRENT_OPERATOR = "Only the current operator can transfer the session"
TRANSFER_ERR_TRANSFER_TO_SELF = "Cannot transfer to yourself"
TRANSFER_ERR_INVALID_TARGET = "Invalid target operator"
