"""
Load generated MusicXML notation into `StudyContent.musicxml`.

The notation files are produced by `scripts/generate_clarke_musicxml.py`
(from the encoded patterns in `studies/seed/clarke_notation.py`, which were
read from the public-domain 1912 Carl Fischer scan) and live in
`studies/seed/musicxml/<slug>.musicxml`.

Idempotent: matches on slug and overwrites `StudyContent.musicxml`.

    python manage.py import_clarke_notation            # load all files
    python manage.py import_clarke_notation --dry-run  # report only
"""
from __future__ import annotations

from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from studies.models import Study, StudyContent

MUSICXML_DIR = Path(__file__).resolve().parents[2] / "seed" / "musicxml"


class Command(BaseCommand):
    help = "Load generated MusicXML files into StudyContent by slug."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true",
                            help="Report changes without writing.")
        parser.add_argument("--dir", default=str(MUSICXML_DIR),
                            help="Directory of <slug>.musicxml files.")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        directory = Path(options["dir"])
        if not directory.is_dir():
            self.stderr.write(f"No such directory: {directory}")
            return

        files = sorted(directory.glob("*.musicxml"))
        loaded = missing_study = 0

        with transaction.atomic():
            for path in files:
                slug = path.stem
                try:
                    study = Study.objects.get(slug=slug)
                except Study.DoesNotExist:
                    self.stderr.write(f"  no Study row for {slug}; skipped")
                    missing_study += 1
                    continue
                if not dry_run:
                    StudyContent.objects.update_or_create(
                        study=study,
                        defaults={
                            "musicxml": path.read_text(encoding="utf-8"),
                            "notation_format": StudyContent.NotationFormat.MUSICXML,
                        },
                    )
                loaded += 1

            if dry_run:
                self.stdout.write(self.style.WARNING("Dry run — rolling back."))
                transaction.set_rollback(True)

        without = (Study.objects.filter(source__icontains="Clarke")
                   .exclude(content__musicxml__gt="")
                   .count())
        self.stdout.write(self.style.SUCCESS(
            f"Loaded notation for {loaded} studies "
            f"({missing_study} files without a Study row). "
            f"{without} Clarke studies still have no notation "
            f"(études and sections pending transcription)."
        ))
