from dataclasses import dataclass

from swolltech.config import Settings
from swolltech.errors import DomainError

ALLOWED_VIDEO_TYPES = {"video/mp4", "video/quicktime"}


@dataclass
class ObjectHead:
    content_type: str | None
    size: int


class MemoryStorage:
    configured = True

    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}
        self.expires = 300

    def presign_put(self, key: str, content_type: str) -> str:
        return f"memory://put/{key}?type={content_type}"

    def presign_get(self, key: str) -> str:
        return f"memory://get/{key}"

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = (data, content_type)

    def head(self, key: str) -> ObjectHead | None:
        item = self.objects.get(key)
        if item is None:
            return None
        data, content_type = item
        return ObjectHead(content_type=content_type, size=len(data))

    def delete_key(self, key: str) -> None:
        self.objects.pop(key, None)

    def delete_prefix(self, prefix: str) -> None:
        for key in list(self.objects):
            if key.startswith(prefix):
                del self.objects[key]


class NullStorage:
    configured = False

    def presign_put(self, key: str, content_type: str) -> str:
        raise DomainError(503, "Object storage is not configured")

    def presign_get(self, key: str) -> str:
        raise DomainError(503, "Object storage is not configured")

    def head(self, key: str) -> ObjectHead | None:
        raise DomainError(503, "Object storage is not configured")

    def delete_key(self, key: str) -> None:
        return None

    def delete_prefix(self, prefix: str) -> None:
        return None


class S3Storage:
    configured = True

    def __init__(self, settings: Settings) -> None:
        import boto3

        self.bucket = settings.s3_bucket
        self.expires = settings.presign_expires_seconds
        self.client = boto3.client(
            "s3",
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key_id or None,
            aws_secret_access_key=settings.s3_secret_access_key or None,
            endpoint_url=settings.s3_endpoint_url or None,
        )

    def presign_put(self, key: str, content_type: str) -> str:
        return self.client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self.bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=self.expires,
        )

    def presign_get(self, key: str) -> str:
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=self.expires,
        )

    def head(self, key: str) -> ObjectHead | None:
        from botocore.exceptions import ClientError

        try:
            response = self.client.head_object(Bucket=self.bucket, Key=key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in {"404", "NoSuchKey", "NotFound"}:
                return None
            raise
        return ObjectHead(content_type=response.get("ContentType"), size=int(response.get("ContentLength", 0)))

    def delete_key(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def delete_prefix(self, prefix: str) -> None:
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            objects = [{"Key": item["Key"]} for item in page.get("Contents", [])]
            if objects:
                self.client.delete_objects(Bucket=self.bucket, Delete={"Objects": objects})


def build_storage(settings: Settings):
    if settings.s3_bucket:
        return S3Storage(settings)
    return NullStorage()
