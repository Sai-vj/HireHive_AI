from django import forms
from resumes.models import Resume

class ResumeForm(forms.ModelForm):
    class Meta:
        model = Resume
        fields = ['file']   # only file upload
