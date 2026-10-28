"""python -m server.jobs.daily_check [--extract]. 운영에서는 한 작업만 동시에 실행한다."""
import argparse
import asyncio
import logging

from server.jobs.pipeline import pipeline_client


async def run(extract=False, reminders_only=False):
    async with pipeline_client() as pipeline:
        extracted = await pipeline.extract() if extract else None
        students = {'students':0,'judged':0,'errors':0} if reminders_only else await pipeline.recalculate()
        await pipeline.reminders()
        return {'extraction':extracted, **students}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--extract', action='store_true')
    parser.add_argument('--reminders-only', action='store_true')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    result = asyncio.run(run(args.extract, args.reminders_only))
    print(result)
    if result['errors'] or (result['extraction'] or {}).get('failed'):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
