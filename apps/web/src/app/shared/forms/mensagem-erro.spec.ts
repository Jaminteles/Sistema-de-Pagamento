import { FormControl, Validators } from '@angular/forms';
import { ERRO_SERVIDOR, mensagemDoCampo, mensagemDosErros } from './mensagem-erro';

describe('mensagemDosErros', () => {
  it('traduz required', () => {
    expect(mensagemDosErros({ required: true })).toBe('Campo obrigatorio.');
  });

  it('traduz minlength usando o tamanho exigido', () => {
    expect(mensagemDosErros({ minlength: { requiredLength: 12, actualLength: 3 } })).toBe(
      'Minimo de 12 caracteres.',
    );
  });

  it('da prioridade ao erro devolvido pela API', () => {
    expect(mensagemDosErros({ required: true, [ERRO_SERVIDOR]: 'E-mail ja cadastrado.' })).toBe(
      'E-mail ja cadastrado.',
    );
  });

  it('usa mensagem neutra para validador desconhecido', () => {
    expect(mensagemDosErros({ cpfInvalido: true })).toBe('Valor invalido.');
  });
});

describe('mensagemDoCampo', () => {
  it('nao mostra nada enquanto o campo nao foi tocado', () => {
    const control = new FormControl('', Validators.required);

    expect(mensagemDoCampo(control)).toBeNull();
  });

  it('mostra o erro local depois de tocar o campo', () => {
    const control = new FormControl('', Validators.required);
    control.markAsTouched();

    expect(mensagemDoCampo(control)).toBe('Campo obrigatorio.');
  });

  it('mostra o erro da API mesmo sem o campo ter sido tocado', () => {
    const control = new FormControl('ana@exemplo.com');
    control.setErrors({ [ERRO_SERVIDOR]: 'E-mail ja cadastrado.' });

    expect(mensagemDoCampo(control)).toBe('E-mail ja cadastrado.');
  });

  it('nao quebra sem control', () => {
    expect(mensagemDoCampo(null)).toBeNull();
  });
});
