"""
Create the ``default`` onboarding variant from the shipped flow.

    python manage.py seed_onboarding_config            # create it if missing
    python manage.py seed_onboarding_config --dry-run  # report, write nothing
    python manage.py seed_onboarding_config --force    # overwrite an edited default

Seed data lives in ``features/seed/onboarding.py``.

**Create-only by default**, which is where this diverges from
``import_clarke``. That command upserts every run because its seed is code the
dashboard cannot edit. This one seeds a row that exists *to be* edited, so an
unconditional upsert would silently revert the owner's copy changes on every
deploy. Re-seeding is opt-in via ``--force``.

Safe to leave in a deploy hook for exactly that reason: it heals an empty
database and does nothing to a populated one.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand

from features.models import OnboardingVariant
from features.seed.onboarding import (
    DEFAULT_KEY,
    DEFAULT_NAME,
    DEFAULT_NOTES,
    DEFAULT_STEPS,
)


class Command(BaseCommand):
    help = "Create the default onboarding variant from the shipped flow."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing anything.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Overwrite the existing default variant, discarding dashboard edits.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        force = options["force"]

        existing = OnboardingVariant.objects.filter(key=DEFAULT_KEY).first()

        if existing is not None and not force:
            self.stdout.write(
                f"“{DEFAULT_KEY}” already exists — left alone. Use --force to overwrite."
            )
            return

        action = "Overwriting" if existing else "Creating"
        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"[dry run] {action} “{DEFAULT_KEY}” with {len(DEFAULT_STEPS)} steps."
                )
            )
            return

        variant, created = OnboardingVariant.objects.update_or_create(
            key=DEFAULT_KEY,
            defaults={
                "name": DEFAULT_NAME,
                "notes": DEFAULT_NOTES,
                "steps": DEFAULT_STEPS,
                "is_default": True,
                "archived": False,
            },
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"{'Created' if created else 'Overwrote'} “{variant.key}” "
                f"with {len(variant.steps)} steps."
            )
        )
