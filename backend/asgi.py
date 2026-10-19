import argparse
import os

from app.core.config import get_settings


def main():
    parser = argparse.ArgumentParser(description="Start the Patitas API")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8010)
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()
    import uvicorn
    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=args.reload, workers=1,
                proxy_headers=True, forwarded_allow_ips=os.getenv("PROXY_TRUSTED_IPS", "127.0.0.1"))


if __name__ == "__main__":
    main()
