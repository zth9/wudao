from __future__ import annotations

import uvicorn


def main() -> None:
    uvicorn.run("wudao_server.app:app", host="127.0.0.1", port=3000, reload=False)


if __name__ == "__main__":
    main()
