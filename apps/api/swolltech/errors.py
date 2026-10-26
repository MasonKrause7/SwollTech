class DomainError(Exception):
    def __init__(self, status: int, detail: str):
        self.status = status
        self.detail = detail
        super().__init__(detail)


class ConflictError(Exception):
    def __init__(self, row: dict):
        self.row = row
        super().__init__("conflict")
