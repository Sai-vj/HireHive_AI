class Interview(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(default=30)
    mode = models.CharField(max_length=50, choices=[('online','Online'),('offline','Offline')], default='online')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='created_interviews')
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    passing_percent = models.PositiveIntegerField(default=60)

    # 🔑 Link to Job
    job = models.ForeignKey(Job, null=True, blank=True, on_delete=models.SET_NULL, related_name="interviews")