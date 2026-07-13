"""
Import the Clarke "Technical Studies" catalog into the database.

Idempotent: safe to run repeatedly. Studies are matched by `slug`, so re-running
updates existing rows rather than duplicating them.

    python manage.py import_clarke            # create/update all studies
    python manage.py import_clarke --dry-run  # report what would change, write nothing
    python manage.py import_clarke --clear     # delete existing Clarke studies first

Seed data lives in `studies/seed/clarke.py` (SECTIONS + STUDIES). The actual
notation (MusicXML) is filled in per-study as it is transcribed; entries without
notation still import fine as catalogue metadata.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from studies.models import Study, StudyContent
from studies.seed.clarke import SECTIONS, STUDIES

# Fields on Study that a seed entry may set (besides slug/section/number).
_STUDY_FIELDS = (
    "title",
    "subtitle",
    "key_signature",
    "tempo",
    "range_label",
    "category",
    "difficulty",
    "est_minutes",
    "instrument",
    "source",
    "order",
)

# Fields on StudyContent that a seed entry may set.
_CONTENT_FIELDS = (
    "musicxml",
    "display_asset",
    "midi_asset",
    "transposition_semitones",
    "source_url",
)


class Command(BaseCommand):
    help = "Import/refresh the Clarke Technical Studies catalog."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report changes without writing to the database.",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete existing Clarke studies before importing.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        clear = options["clear"]

        section_labels = {s["section"]: s["label"] for s in SECTIONS}

        created = updated = 0

        with transaction.atomic():
            if clear:
                qs = Study.objects.filter(source__icontains="Clarke")
                self.stdout.write(f"Deleting {qs.count()} existing Clarke studies…")
                if not dry_run:
                    qs.delete()

            for entry in STUDIES:
                slug = entry["slug"]
                section = entry["section"]
                defaults = {
                    "section": section,
                    "section_label": entry.get(
                        "section_label", section_labels.get(section, "")
                    ),
                    "number": entry["number"],
                }
                for field in _STUDY_FIELDS:
                    if field in entry:
                        defaults[field] = entry[field]
                # Allow the seed to spell the display key as `key`.
                if "key" in entry:
                    defaults["key_signature"] = entry["key"]

                if dry_run:
                    exists = Study.objects.filter(slug=slug).exists()
                    created += 0 if exists else 1
                    updated += 1 if exists else 0
                    self.stdout.write(f"  [{'update' if exists else 'create'}] {slug}")
                    continue

                study, was_created = Study.objects.update_or_create(
                    slug=slug, defaults=defaults
                )
                created += int(was_created)
                updated += int(not was_created)

                content_defaults = {
                    field: entry[field]
                    for field in _CONTENT_FIELDS
                    if field in entry
                }
                if content_defaults:
                    StudyContent.objects.update_or_create(
                        study=study, defaults=content_defaults
                    )

            if dry_run:
                self.stdout.write(self.style.WARNING("Dry run — rolling back."))
                transaction.set_rollback(True)

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. {created} created, {updated} updated, "
                f"{len(STUDIES)} total in seed across {len(SECTIONS)} sections."
            )
        )
