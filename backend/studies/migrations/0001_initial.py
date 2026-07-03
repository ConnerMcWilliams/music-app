import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Study",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("slug", models.SlugField(max_length=64, unique=True)),
                ("section", models.PositiveIntegerField(db_index=True, default=0)),
                ("section_label", models.CharField(blank=True, max_length=80)),
                ("number", models.PositiveIntegerField()),
                ("title", models.CharField(max_length=200)),
                ("subtitle", models.CharField(blank=True, max_length=200)),
                ("key_signature", models.CharField(blank=True, max_length=40, verbose_name="key")),
                ("tempo", models.CharField(blank=True, max_length=40)),
                ("range_label", models.CharField(blank=True, max_length=40)),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("foundational", "Foundational"),
                            ("articulation", "Articulation"),
                            ("flexibility", "Flexibility"),
                        ],
                        default="foundational",
                        max_length=20,
                    ),
                ),
                ("est_minutes", models.PositiveIntegerField(default=0)),
                ("instrument", models.CharField(default="trumpet", max_length=40)),
                ("source", models.CharField(default="Clarke — Technical Studies", max_length=200)),
                ("order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name_plural": "studies",
                "ordering": ["section", "order", "number"],
            },
        ),
        migrations.AddIndex(
            model_name="study",
            index=models.Index(fields=["section", "number"], name="studies_section_number_idx"),
        ),
        migrations.CreateModel(
            name="StudyContent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "notation_format",
                    models.CharField(
                        choices=[("musicxml", "MusicXML")],
                        default="musicxml",
                        max_length=20,
                    ),
                ),
                ("musicxml", models.TextField(blank=True)),
                ("display_asset", models.CharField(blank=True, max_length=500)),
                ("midi_asset", models.CharField(blank=True, max_length=500)),
                ("transposition_semitones", models.SmallIntegerField(default=-2)),
                ("source_url", models.URLField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "study",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="content",
                        to="studies.study",
                    ),
                ),
            ],
            options={
                "verbose_name_plural": "study content",
            },
        ),
    ]
