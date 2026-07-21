from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='PageVisit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('visitor_id', models.CharField(db_index=True, max_length=64)),
                ('path', models.CharField(blank=True, max_length=255)),
                ('referrer_host', models.CharField(blank=True, max_length=255)),
                ('source', models.CharField(blank=True, db_index=True, max_length=64)),
                ('utm_source', models.CharField(blank=True, max_length=120)),
                ('utm_medium', models.CharField(blank=True, max_length=120)),
                ('utm_campaign', models.CharField(blank=True, max_length=120)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
