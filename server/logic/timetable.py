from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ClassTime(BaseModel):
    model_config = ConfigDict(extra="forbid")
    day: Literal["월", "화", "수", "목", "금", "토", "일"]
    start: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")

    @model_validator(mode="after")
    def ordered(self):
        if self.start >= self.end:
            raise ValueError("수업 종료 시각은 시작 시각보다 늦어야 합니다.")
        return self


def overlaps(a: ClassTime, b: ClassTime) -> bool:
    # 앞 수업이 끝나는 시각에 바로 시작하는 수업은 중복이 아니다.
    return a.day == b.day and a.start < b.end and b.start < a.end


def validate_slots(slots: list[ClassTime]):
    if any(overlaps(a, b) for index, a in enumerate(slots) for b in slots[index + 1:]):
        raise ValueError("한 과목 안의 수업 시간이 서로 겹칩니다.")
