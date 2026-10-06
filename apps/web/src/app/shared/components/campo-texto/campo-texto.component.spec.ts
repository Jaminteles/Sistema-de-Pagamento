import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, Validators } from '@angular/forms';
import { ERRO_SERVIDOR } from '../../forms/mensagem-erro';
import { CampoTextoComponent } from './campo-texto.component';

describe('CampoTextoComponent', () => {
  function montar(control: FormControl<string | null>) {
    const fixture = TestBed.createComponent(CampoTextoComponent);
    fixture.componentRef.setInput('rotulo', 'E-mail');
    fixture.componentRef.setInput('control', control);
    fixture.componentRef.setInput('tipo', 'email');
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampoTextoComponent],
      providers: [provideZonelessChangeDetection()],
    });
  });

  it('renderiza o rotulo e o input do tipo informado', () => {
    const fixture = montar(new FormControl(''));
    const input = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('E-mail');
    expect(input.type).toBe('email');
  });

  it('nao produz texto de erro enquanto o campo esta valido', () => {
    const fixture = montar(new FormControl('ana@exemplo.com', Validators.email));

    expect(fixture.componentInstance.textoErro()).toBe('');
  });

  it('usa a mensagem do validador local', () => {
    const control = new FormControl('', Validators.required);
    const fixture = montar(control);

    control.markAsTouched();
    fixture.detectChanges();

    expect(fixture.componentInstance.textoErro()).toBe('Campo obrigatorio.');
  });

  it('usa a mensagem devolvida pela API quando existe', () => {
    const control = new FormControl('ana@exemplo.com');
    const fixture = montar(control);

    control.setErrors({ [ERRO_SERVIDOR]: 'E-mail ja cadastrado.' });
    fixture.detectChanges();

    expect(fixture.componentInstance.textoErro()).toBe('E-mail ja cadastrado.');
  });

  it('reflete o control no DOM via Reactive Forms', () => {
    const control = new FormControl('ana@exemplo.com');
    const fixture = montar(control);
    const input = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;

    expect(input.value).toBe('ana@exemplo.com');
  });
});
