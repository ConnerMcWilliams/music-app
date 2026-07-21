from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('waitlist', '0002_waitlistsignup_subscribed'),
    ]

    operations = [
        migrations.AddField(
            model_name='waitlistsignup',
            name='source',
            field=models.CharField(blank=True, db_index=True, max_length=64),
        ),
        migrations.AddField(
            model_name='waitlistsignup',
            name='utm_source',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='waitlistsignup',
            name='utm_medium',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='waitlistsignup',
            name='utm_campaign',
            field=models.CharField(blank=True, max_length=120),
        ),
    ]
